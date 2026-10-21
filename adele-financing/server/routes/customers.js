import { isPostgres } from '../databaseDriver.js'
import { nextBusinessId } from '../businessIds.js'
import { money, finite, binary } from '../money.js'
import { Router } from 'express';
import { queryAll, queryOne, run } from '#adele-db';
import { requireAuth, requireRole, handleError } from '../auth.js';
import { writeAudit, genId, isValidRwPhone, rwPhoneFull } from '../utils.js';
const router = Router();

// Customers store the term of their latest approved loan (months). Loan
// products can run much longer than the old fixed 6-month ceiling, so the
// legacy 6-month cap is relaxed to a generous sanity bound instead.
const MAX_CUSTOMER_DURATION_MONTHS = 120;
function mapCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    customer_id: row.customer_id,
    full_name: row.full_name,
    phone_number: row.phone_number,
    gender: row.gender || '',
    email: row.email,
    amount: row.amount,
    duration: row.duration,
    status: row.status,
    registration_date: row.registration_date
  };
}
async function findCustomerByIdentity(phoneNumber, email, excludeId = null) {
  const identityConditions = ['phone_number = ?'];
  const params = [phoneNumber];
  if (email) {
    identityConditions.push('LOWER(email) = LOWER(?)');
    params.push(String(email).trim());
  }
  const conditions = [`(${identityConditions.join(' OR ')})`];
  if (binary("!==", excludeId, null) && binary("!==", excludeId, undefined) && binary("!==", excludeId, '')) {
    conditions.push('id <> ?');
    params.push(excludeId);
  }
  return queryOne(`SELECT * FROM customers
     WHERE ${conditions.join(' AND ')}
     ORDER BY id LIMIT 1`, params);
}
async function nextCustomerId() {
  return await nextBusinessId(null, "customers");
}

// All authenticated staff can view customers
router.get('/', requireAuth, async (req, res) => {
  try {
    let sql = `
      SELECT * FROM customers
    `;
    const params = {};
    const q = req.query;
    const where = [];
    if (q.status && binary("!==", q.status, '')) {
      where.push('status = @status');
      params.status = q.status;
    }
    if (q.search && binary("!==", q.search.trim(), '')) {
      where.push('(customer_id LIKE @search OR full_name LIKE @search OR phone_number LIKE @search OR email LIKE @search OR gender LIKE @search)');
      params.search = `%${q.search.trim()}%`;
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY id DESC LIMIT 500`;
    const rows = await queryAll(sql, params);
    res.json({
      customers: rows.map(mapCustomer)
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({
      error: 'Customer not found.'
    });
    const [loans, applications, repayments] = await Promise.all([queryAll(`SELECT
           l.*,
           la.application_id,
           la.application_date,
           la.approved_at,
           la.interest_rate,
           lp.name AS product_name
         FROM loans l
         LEFT JOIN loan_applications la ON la.id = l.application_id
         LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
         WHERE l.customer_id = ?
         ORDER BY l.created_at DESC, l.id DESC`, [req.params.id]), queryAll(`SELECT
           la.id,
           la.application_id,
           la.loan_product_id,
           lp.name AS product_name,
           la.requested_amount,
           la.approved_amount,
           la.duration AS requested_duration,
           la.approved_duration,
           la.interest_rate,
           la.purpose,
           la.status,
           la.application_date,
           la.approved_at,
           la.rejected_at,
           la.rejection_reason,
           la.created_at
         FROM loan_applications la
         LEFT JOIN loan_products lp ON lp.id = la.loan_product_id
         WHERE la.customer_id = ?
         ORDER BY la.created_at DESC, la.id DESC`, [req.params.id]), queryAll(`SELECT
           r.id,
           r.repayment_id,
           r.loan_id,
           l.loan_id AS loan_reference,
           r.amount,
           r.payment_date,
           r.payment_method,
           r.reference_number,
           r.created_at,
           l.status AS loan_status
         FROM repayments r
         JOIN loans l ON l.id = r.loan_id
         WHERE r.customer_id = ?
         ORDER BY r.payment_date DESC, r.created_at DESC, r.id DESC`, [req.params.id])]);
    const currentLoans = loans.filter(loan => binary("===", loan.status, 'active'));
    const previousLoans = loans.filter(loan => binary("!==", loan.status, 'active'));
    const completedLoans = loans.filter(loan => binary("===", loan.status, 'completed'));
    const outstandingBalance = currentLoans.reduce((total, loan) => binary("+", total, money(loan.outstanding_balance || 0)), 0);
    res.json({
      customer: mapCustomer(row),
      loans,
      current_loan: currentLoans[0] || null,
      current_loans: currentLoans,
      previous_loans: previousLoans,
      completed_loans: completedLoans,
      applications,
      repayments,
      outstanding_balance: outstandingBalance
    });
  } catch (e) {
    handleError(res, e);
  }
});

// Bulk import customers from an Excel export
router.post('/bulk', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const items = Array.isArray(req.body?.customers) ? req.body.customers : [];
    if (binary("===", items.length, 0)) {
      return res.status(400).json({
        error: 'No customers provided to import.'
      });
    }
    const maxCustomer = isPostgres() ? {
      n: 0
    } : await queryOne(`SELECT COALESCE(MAX(CAST(SUBSTRING(customer_id, 5) AS UNSIGNED)), 0) AS n
       FROM customers`);
    let seq = Number(maxCustomer.n);
    const imported = [];
    const errors = [];
    for (let i = 0; binary("<", i, items.length); i++) {
      const row = items[i];
      const index = binary("+", i, 1);
      try {
        const full_name = String(row.full_name ?? '').trim();
        const phone_number = String(row.phone_number ?? '').replace(/[^\d+]/g, '');
        const gender = String(row.gender ?? '').trim();
        const email_raw = String(row.email ?? '').trim();
        const amount = money(row.amount ?? 0);
        const duration = Number(row.duration ?? 0);
        const status = binary("===", row.status, 'inactive') ? 'inactive' : 'active';
        let email = email_raw || null;
        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
          errors.push({
            row: index,
            error: `Invalid email "${email_raw}".`
          });
          continue;
        }
        const rawDate = row.registration_date ? String(row.registration_date).trim() : '';
        let registration_date;
        if (!rawDate) {
          registration_date = new Date().toISOString().slice(0, 10);
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          errors.push({
            row: index,
            error: `Invalid registration date "${rawDate}". Use YYYY-MM-DD.`
          });
          continue;
        } else if (binary(">", rawDate, new Date().toISOString().slice(0, 10))) {
          errors.push({
            row: index,
            error: `Registration date "${rawDate}" is in the future.`
          });
          continue;
        } else {
          registration_date = rawDate;
        }
        if (!full_name || !phone_number) {
          errors.push({
            row: index,
            error: 'Full name and phone number are required.'
          });
          continue;
        }
        if (!isValidRwPhone(phone_number)) {
          errors.push({
            row: index,
            error: `Invalid phone "${phone_number}". Enter a valid 9-digit number.`
          });
          continue;
        }
        if (!finite(amount) || binary("<", amount, 0)) {
          errors.push({
            row: index,
            error: 'Amount must be a valid number (0 or more).'
          });
          continue;
        }
        if (!finite(duration) || binary("<", duration, 0) || binary(">", duration, MAX_CUSTOMER_DURATION_MONTHS)) {
          errors.push({
            row: index,
            error: `Duration must be between 0 and ${MAX_CUSTOMER_DURATION_MONTHS} months.`
          });
          continue;
        }
        const normalizedPhone = rwPhoneFull(phone_number);
        const duplicate = await findCustomerByIdentity(normalizedPhone, email);
        if (duplicate) {
          errors.push({
            row: index,
            error: `Customer already exists (${duplicate.customer_id}).`
          });
          continue;
        }
        const genderNorm = ['Male', 'Female', 'Other'].includes(gender) ? gender : '';
        const customer_id = isPostgres() ? await nextBusinessId(null, 'customers') : genId('CUS', seq++);
        await run(`INSERT INTO customers (customer_id, full_name, phone_number, gender, email, amount, duration, status, registration_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [customer_id, full_name, normalizedPhone, genderNorm, email, amount, duration, status, registration_date]);
        imported.push({
          customer_id,
          full_name,
          phone_number: normalizedPhone
        });
      } catch (e) {
        errors.push({
          row: index,
          error: e.message
        });
      }
    }
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'CUSTOMERS_BULK_IMPORTED',
      description: `Bulk imported ${imported.length} customer(s) with ${errors.length} error(s)`
    });
    res.status(imported.length ? 201 : 200).json({
      imported,
      errors
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.post('/', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const {
      full_name,
      phone_number,
      gender,
      email,
      amount,
      duration,
      status = 'active',
      registration_date: registrationDateRaw
    } = req.body || {};
    if (!full_name || !phone_number) {
      return res.status(400).json({
        error: 'Full name and phone number are required.'
      });
    }
    if (!isValidRwPhone(phone_number)) {
      return res.status(400).json({
        error: 'Phone number must be a valid 9-digit number.'
      });
    }
    const normalizedPhone = rwPhoneFull(phone_number);
    const emailValue = String(email ?? '').trim();
    if (emailValue && !/^\S+@\S+\.\S+$/.test(emailValue)) {
      return res.status(400).json({
        error: 'Please provide a valid email address.'
      });
    }
    const duplicate = await findCustomerByIdentity(normalizedPhone, emailValue);
    if (duplicate) {
      return res.status(409).json({
        error: `A customer with this phone number or email already exists (${duplicate.customer_id}).`
      });
    }
    const amountValue = money(amount);
    if (!finite(amountValue) || binary("<", amountValue, 0)) {
      return res.status(400).json({
        error: 'Amount must be a valid number.'
      });
    }
    const durationValue = Number(duration);
    if (!finite(durationValue) || binary("<", durationValue, 0) || binary(">", durationValue, MAX_CUSTOMER_DURATION_MONTHS)) {
      return res.status(400).json({
        error: `Duration must be between 0 and ${MAX_CUSTOMER_DURATION_MONTHS} months.`
      });
    }
    const customer_id = await nextCustomerId();
    const rawDate = registrationDateRaw ? String(registrationDateRaw).trim() : '';
    const today = new Date().toISOString().slice(0, 10);
    let registration_date;
    if (!rawDate) {
      registration_date = today;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return res.status(400).json({
        error: 'Date must be in YYYY-MM-DD format.'
      });
    } else if (binary(">", rawDate, today)) {
      return res.status(400).json({
        error: 'Date cannot be in the future.'
      });
    } else {
      registration_date = rawDate;
    }
    const info = await run(`INSERT INTO customers (customer_id, full_name, phone_number, gender, email, amount, duration, status, registration_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [customer_id, full_name, normalizedPhone, gender || '', emailValue || null, amountValue, durationValue, status, registration_date]);
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'CUSTOMER_CREATED',
      description: `Created customer ${full_name}`,
      relatedRecord: `customer:${customer_id}`
    });
    const row = await queryOne('SELECT * FROM customers WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json({
      customer: mapCustomer(row)
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.put('/:id', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({
      error: 'Customer not found.'
    });
    const {
      full_name,
      phone_number,
      gender,
      email,
      amount,
      duration,
      status,
      registration_date: registrationDateRaw
    } = req.body || {};
    const updated = {
      full_name: binary("!==", full_name, undefined) ? full_name : existing.full_name,
      phone_number: binary("!==", phone_number, undefined) ? phone_number : existing.phone_number,
      gender: binary("!==", gender, undefined) ? gender : existing.gender,
      email: binary("!==", email, undefined) ? email : existing.email,
      amount: binary("!==", amount, undefined) ? amount : existing.amount,
      duration: binary("!==", duration, undefined) ? duration : existing.duration,
      status: binary("!==", status, undefined) ? status : existing.status,
      registration_date: binary("!==", registrationDateRaw, undefined) ? registrationDateRaw : existing.registration_date
    };
    if (!updated.full_name || !updated.phone_number) {
      return res.status(400).json({
        error: 'Full name and phone number are required.'
      });
    }
    if (!isValidRwPhone(updated.phone_number)) {
      return res.status(400).json({
        error: 'Phone number must be a valid 9-digit number.'
      });
    }
    const normalizedPhone = rwPhoneFull(updated.phone_number);
    const emailValue = String(updated.email ?? '').trim() || null;
    if (emailValue && !/^\S+@\S+\.\S+$/.test(emailValue)) {
      return res.status(400).json({
        error: 'Please provide a valid email address.'
      });
    }
    const duplicate = await findCustomerByIdentity(normalizedPhone, emailValue, req.params.id);
    if (duplicate) {
      return res.status(409).json({
        error: `A customer with this phone number or email already exists (${duplicate.customer_id}).`
      });
    }
    const amountValue = money(updated.amount);
    if (!finite(amountValue) || binary("<", amountValue, 0)) {
      return res.status(400).json({
        error: 'Amount must be a valid number.'
      });
    }
    const durationValue = Number(updated.duration);
    if (!finite(durationValue) || binary("<", durationValue, 0) || binary(">", durationValue, MAX_CUSTOMER_DURATION_MONTHS)) {
      return res.status(400).json({
        error: `Duration must be between 0 and ${MAX_CUSTOMER_DURATION_MONTHS} months.`
      });
    }
    const rawDate = String(updated.registration_date ?? '').trim();
    const today = new Date().toISOString().slice(0, 10);
    let registration_date;
    if (!rawDate) {
      registration_date = today;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return res.status(400).json({
        error: 'Date must be in YYYY-MM-DD format.'
      });
    } else if (binary(">", rawDate, today)) {
      return res.status(400).json({
        error: 'Date cannot be in the future.'
      });
    } else {
      registration_date = rawDate;
    }
    await run(`UPDATE customers SET full_name = ?, phone_number = ?, gender = ?, email = ?, amount = ?, duration = ?, status = ?, registration_date = ?
       WHERE id = ?`, [updated.full_name, normalizedPhone, updated.gender || '', emailValue, amountValue, durationValue, updated.status, registration_date, req.params.id]);
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'CUSTOMER_UPDATED',
      description: `Updated customer ${updated.full_name}`,
      relatedRecord: `customer:${existing.customer_id}`
    });
    const row = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    res.json({
      customer: mapCustomer(row)
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.delete('/:id', requireAuth, requireRole('super_admin', 'manager'), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({
      error: 'Customer not found.'
    });
    const loans = await queryOne('SELECT COUNT(*) AS c FROM loans WHERE customer_id = ?', [req.params.id]);
    const applications = await queryOne('SELECT COUNT(*) AS c FROM loan_applications WHERE customer_id = ?', [req.params.id]);
    if (binary(">", Number(loans.c), 0) || binary(">", Number(applications.c), 0)) {
      return res.status(400).json({
        error: 'This customer has loans or applications. Deactivate them instead of deleting.'
      });
    }
    await run('DELETE FROM customers WHERE id = ?', [req.params.id]);
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'CUSTOMER_DELETED',
      description: `Deleted customer ${existing.full_name}`,
      relatedRecord: `customer:${existing.customer_id}`
    });
    res.json({
      success: true
    });
  } catch (e) {
    handleError(res, e);
  }
});
export default router;

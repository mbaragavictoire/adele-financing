import { nextBusinessId } from '../businessIds.js'
import { money, finite, binary } from '../money.js'
import { Router } from 'express';
import { queryAll, queryOne, run, withTransaction } from '../db.js';
import { requireAuth, requireRole, handleError } from '../auth.js';
import { writeAudit, } from '../utils.js';
import { findOrCreateCustomer } from './publicApplications.js';
const router = Router();
const applicationWithJoins = `
  SELECT
    la.*,
    COALESCE(c.full_name, TRIM(CONCAT_WS(' ', la.applicant_first_name, la.applicant_last_name))) AS customer_name,
    c.customer_id AS customer_reference,
    COALESCE(c.phone_number, la.applicant_phone, '') AS customer_phone,
    COALESCE(c.email, la.applicant_email, '') AS customer_email,
    COALESCE(c.gender, '') AS customer_gender,
    lp.name AS product_name
  FROM loan_applications la
  LEFT JOIN customers c ON c.id = la.customer_id
  JOIN loan_products lp ON lp.id = la.loan_product_id
`;
function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// All authenticated staff can view applications
router.get('/', requireAuth, async (req, res) => {
  try {
    let sql = applicationWithJoins;
    const params = {};
    const where = [];
    const q = req.query;
    if (q.status && binary("!==", q.status, '')) {
      where.push('la.status = @status');
      params.status = q.status;
    }
    if (q.customer_id && binary("!==", q.customer_id, '')) {
      where.push('la.customer_id = @customer_id');
      params.customer_id = q.customer_id;
    }
    if (q.search && binary("!==", q.search.trim(), '')) {
      where.push('(la.application_id LIKE @search OR c.full_name LIKE @search OR lp.name LIKE @search OR la.applicant_phone LIKE @search OR la.applicant_email LIKE @search OR CONCAT_WS(\' \', la.applicant_first_name, la.applicant_last_name) LIKE @search)');
      params.search = `%${q.search.trim()}%`;
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY la.created_at DESC LIMIT 500';
    const rows = await queryAll(sql, params);
    res.json({
      applications: rows
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const row = await queryOne(`${applicationWithJoins} WHERE la.id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({
      error: 'Application not found.'
    });
    res.json({
      application: row
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.post('/', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const {
      customer_id,
      loan_product_id,
      requested_amount,
      duration,
      purpose
    } = req.body || {};
    if (!customer_id || !loan_product_id || !requested_amount || !duration) {
      return res.status(400).json({
        error: 'Customer, loan product, requested amount and duration are required.'
      });
    }
    const customer = await queryOne('SELECT * FROM customers WHERE id = ?', [customer_id]);
    if (!customer) return res.status(400).json({
      error: 'Customer not found.'
    });
    const product = await queryOne('SELECT * FROM loan_products WHERE id = ?', [loan_product_id]);
    if (!product) return res.status(400).json({
      error: 'Loan product not found.'
    });
    const amount = money(requested_amount);
    const durationValue = Number(duration);
    if (!finite(amount) || binary("<=", amount, 0)) {
      return res.status(400).json({
        error: 'Invalid requested amount.'
      });
    }
    const minAmount = money(product.min_amount) || 0;
    const maxAmount = money(product.max_amount) || 0;
    if (binary("<", amount, minAmount) || binary(">", maxAmount, 0) && binary(">", amount, maxAmount)) {
      return res.status(400).json({
        error: 'Requested amount is outside the product limits.'
      });
    }
    if (!Number.isInteger(durationValue) || binary("<", durationValue, 1) || binary(">", durationValue, Number(product.max_duration || 6))) {
      return res.status(400).json({
        error: 'Invalid loan duration.'
      });
    }
    const application_date = new Date().toISOString().slice(0, 10);
    let application_id = '';
    let info;
    for (let attempt = 0; binary("<", attempt, 5); attempt++) {
      const candidateId = await nextBusinessId(null, "loan_applications");
      try {
        info = await run(`INSERT INTO loan_applications
            (application_id, customer_id, loan_product_id, requested_amount, duration, purpose,
             application_date, assigned_loan_officer_id, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [candidateId, customer_id, loan_product_id, amount, durationValue, purpose || null, application_date, req.user.sub, 'pending']);
        application_id = candidateId;
        break;
      } catch (error) {
        if (binary("!==", error?.code, 'ER_DUP_ENTRY') || binary("===", attempt, 4)) throw error;
      }
    }
    if (!application_id) {
      return res.status(500).json({
        error: 'Could not allocate an application reference. Please try again.'
      });
    }
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'APPLICATION_CREATED',
      description: `Created loan application ${application_id} for ${customer.full_name}`,
      relatedRecord: `application:${application_id}`
    });
    const row = await queryOne(`${applicationWithJoins} WHERE la.id = ?`, [info.lastInsertRowid]);
    res.status(201).json({
      application: row
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.put('/:id/review', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const app = await queryOne('SELECT * FROM loan_applications WHERE id = ?', [req.params.id]);
    if (!app) return res.status(404).json({
      error: 'Application not found.'
    });
    if (binary("!==", app.status, 'pending')) return res.status(400).json({
      error: `Application is already ${app.status}.`
    });
    const {
      status
    } = req.body || {};
    if (!['under_review'].includes(status)) return res.status(400).json({
      error: 'Invalid status.'
    });
    const updated = await run("UPDATE loan_applications SET status = ? WHERE id = ? AND status = 'pending'", [status, req.params.id]);
    if (binary("!==", updated.changes, 1)) {
      return res.status(409).json({
        error: 'This application is no longer pending.'
      });
    }
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'APPLICATION_REVIEWED',
      description: `Moved application ${app.application_id} to under review`,
      relatedRecord: `application:${app.application_id}`
    });
    const row = await queryOne(`${applicationWithJoins} WHERE la.id = ?`, [req.params.id]);
    res.json({
      application: row
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.put('/:id/reject', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const app = await queryOne('SELECT * FROM loan_applications WHERE id = ?', [req.params.id]);
    if (!app) return res.status(404).json({
      error: 'Application not found.'
    });
    if (binary("===", app.status, 'approved') || binary("===", app.status, 'rejected')) return res.status(400).json({
      error: `Application is already ${app.status}.`
    });
    const {
      reason
    } = req.body || {};
    if (!reason || !reason.trim()) return res.status(400).json({
      error: 'A rejection reason is required.'
    });
    const updated = await run(`UPDATE loan_applications
       SET status = 'rejected', rejection_reason = ?, rejected_by = ?, rejected_at = NOW()
       WHERE id = ? AND status NOT IN ('approved', 'rejected')`, [reason.trim(), req.user.sub, req.params.id]);
    if (binary("!==", updated.changes, 1)) {
      return res.status(409).json({
        error: 'This application is already finalized.'
      });
    }
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'APPLICATION_REJECTED',
      description: `Rejected application ${app.application_id}: ${reason}`,
      relatedRecord: `application:${app.application_id}`
    });
    const row = await queryOne(`${applicationWithJoins} WHERE la.id = ?`, [req.params.id]);
    res.json({
      application: row
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.put('/:id/approve', requireAuth, requireRole('super_admin', 'manager'), async (req, res) => {
  try {
    const result = await withTransaction(async tx => {
      const app = await tx.queryOne('SELECT * FROM loan_applications WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!app) throw httpError(404, 'Application not found.');
      if (binary("!==", app.status, 'under_review')) {
        throw httpError(409, 'Only applications under review can be approved.');
      }
      const product = await tx.queryOne('SELECT * FROM loan_products WHERE id = ?', [app.loan_product_id]);
      if (!product) throw httpError(400, 'Loan product not found.');
      const approvedAmount = money(req.body?.approved_amount ?? app.requested_amount);
      const approvedDuration = Number(req.body?.approved_duration ?? app.duration);
      const interestRate = money(req.body?.interest_rate ?? product.interest_rate ?? 0);
      const maxDuration = Number(product.max_duration) || 6;
      const minAmount = money(product.min_amount) || 0;
      const maxAmount = money(product.max_amount) || 0;
      if (!finite(approvedAmount) || binary("<=", approvedAmount, 0)) {
        throw httpError(400, 'Invalid approved amount.');
      }
      if (binary("<", approvedAmount, minAmount) || binary(">", maxAmount, 0) && binary(">", approvedAmount, maxAmount)) {
        throw httpError(400, `Approved amount must be between ${minAmount} and ${maxAmount || 'the product maximum'} RWF.`);
      }
      if (!Number.isInteger(approvedDuration) || binary("<", approvedDuration, 1) || binary(">", approvedDuration, maxDuration)) {
        throw httpError(400, `Approved duration must be between 1 and ${maxDuration} months.`);
      }
      if (!finite(interestRate) || binary("<", interestRate, 0)) {
        throw httpError(400, 'Invalid interest rate.');
      }
      let customer = app.customer_id ? await tx.queryOne('SELECT * FROM customers WHERE id = ?', [app.customer_id]) : null;
      const hadLinkedCustomer = Boolean(customer);
      let customerCreated = false;
      if (!customer) {
        const first = String(app.applicant_first_name ?? '').trim();
        const last = String(app.applicant_last_name ?? '').trim();
        const phone = String(app.applicant_phone ?? '').trim();
        if (!`${first} ${last}`.trim() || !phone) {
          throw httpError(400, 'Applicant name and phone number are required before approval.');
        }
        const customerResult = await findOrCreateCustomer({
          first,
          last,
          email: app.applicant_email,
          phone,
          amount: approvedAmount,
          duration: approvedDuration,
          applicationDate: app.application_date
        }, tx);
        customer = customerResult.customer;
        customerCreated = customerResult.created;
      }
      if (!customer) throw httpError(500, 'Customer could not be resolved.');

      // The customer record stores the latest approved amount and duration. The
      // application remains the authoritative historical record of this request.
      await tx.run('UPDATE customers SET amount = ?, duration = ? WHERE id = ?', [approvedAmount, approvedDuration, customer.id]);
      const updated = await tx.run(`UPDATE loan_applications
         SET status = 'approved', approved_amount = ?, approved_duration = ?, interest_rate = ?,
             customer_id = ?, approved_by = ?, approved_at = NOW()
         WHERE id = ? AND status = 'under_review'`, [approvedAmount, approvedDuration, interestRate, customer.id, req.user.sub, req.params.id]);
      if (binary("!==", updated.changes, 1)) {
        throw httpError(409, 'This application was already approved by another user.');
      }
      if (customerCreated) {
        await writeAudit({
          userId: req.user.sub,
          userName: req.user.name,
          action: 'CUSTOMER_CREATED_FROM_APPROVAL',
          description: `Created customer ${customer.full_name} (${customer.customer_id}) from approved application ${app.application_id}`,
          relatedRecord: `customer:${customer.customer_id}`
        }, tx);
      } else if (!hadLinkedCustomer) {
        await writeAudit({
          userId: req.user.sub,
          userName: req.user.name,
          action: 'CUSTOMER_LINKED_FROM_APPROVAL',
          description: `Linked approved application ${app.application_id} to existing customer ${customer.full_name} (${customer.customer_id})`,
          relatedRecord: `application:${app.application_id}`
        }, tx);
      }
      await writeAudit({
        userId: req.user.sub,
        userName: req.user.name,
        action: 'APPLICATION_APPROVED',
        description: `Approved application ${app.application_id} for ${approvedAmount} RWF`,
        relatedRecord: `application:${app.application_id}`
      }, tx);
      const row = await tx.queryOne(`${applicationWithJoins} WHERE la.id = ?`, [req.params.id]);
      const customerRow = await tx.queryOne('SELECT * FROM customers WHERE id = ?', [customer.id]);
      return {
        application: row,
        customer: customerRow,
        customer_created: customerCreated
      };
    });
    res.json(result);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({
      error: e.message
    });
    handleError(res, e);
  }
});
export default router;

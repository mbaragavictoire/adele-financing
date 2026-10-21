import { isPostgres } from '../databaseDriver.js'
import { nextBusinessId } from '../businessIds.js'
import { money, finite, math, binary } from '../money.js'
import { Router } from 'express';
import { queryAll, withTransaction } from '../db.js';
import { requireAuth, requireRole, handleError } from '../auth.js';
import { writeAudit, } from '../utils.js';
const router = Router();
function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Repayment records carry amounts, dates and bank references, so they are
// restricted to the same roles as /api/reports/repayments. Previously this
// listing was open to every authenticated user, which made that report's role
// check decorative.
router.get('/', requireAuth, requireRole('super_admin', 'finance_officer'), async (req, res) => {
  try {
    let sql = `
      SELECT r.*, c.full_name AS customer_name, l.loan_id
      FROM repayments r
      JOIN customers c ON c.id = r.customer_id
      JOIN loans l ON l.id = r.loan_id
    `;
    const params = {};
    const where = [];
    const q = req.query;
    if (q.loan_id && binary("!==", q.loan_id, '')) {
      where.push('r.loan_id = @loan_id');
      params.loan_id = q.loan_id;
    }
    if (q.search && binary("!==", q.search.trim(), '')) {
      where.push('(r.repayment_id LIKE @search OR c.full_name LIKE @search OR l.loan_id LIKE @search)');
      params.search = `%${q.search.trim()}%`;
    }
    if (q.from && q.to) {
      where.push('r.payment_date BETWEEN @from AND @to');
      params.from = q.from;
      params.to = q.to;
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ' ORDER BY r.payment_date DESC LIMIT 500';
    const rows = await queryAll(sql, params);
    res.json({
      repayments: rows
    });
  } catch (e) {
    handleError(res, e);
  }
});
router.post('/', requireAuth, requireRole('super_admin', 'finance_officer'), async (req, res) => {
  try {
    const {
      loan_id,
      amount,
      payment_date,
      payment_method = 'Cash',
      reference_number
    } = req.body || {};
    if (!loan_id || binary("===", amount, undefined) || binary("===", amount, null) || !payment_date) {
      throw httpError(400, 'Loan, amount and payment date are required.');
    }
    const result = await withTransaction(async tx => {
      const loan = await tx.queryOne('SELECT * FROM loans WHERE id = ? FOR UPDATE', [loan_id]);
      if (!loan) throw httpError(404, 'Loan not found.');
      if (binary("===", loan.status, 'completed')) throw httpError(400, 'This loan is already completed.');
      const pay = money(amount);
      if (!finite(pay) || binary("<=", pay, 0)) throw httpError(400, 'Invalid repayment amount.');
      const outstanding = money(loan.outstanding_balance);
      // MariaDB retains its legacy sub-franc tolerance. PostgreSQL requires exact
      // settlement: no implicit historical balance write-off or overpayment.
      // Allow the legacy closing payment to clear a sub-franc residue left by float
      // arithmetic on balances created before whole-franc rounding. Anything
      // beyond that is still an overpayment and is refused.
      const CLOSING_EPSILON = isPostgres() ? money('0') : 0.5;
      if (binary(">", pay, binary("+", outstanding, CLOSING_EPSILON))) {
        throw httpError(400, `Amount exceeds outstanding balance of ${outstanding}.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payment_date).trim())) {
        throw httpError(400, 'Payment date must use YYYY-MM-DD.');
      }
      const repaymentId = await nextBusinessId(tx, "repayments");
      await tx.run(`INSERT INTO repayments
          (repayment_id, loan_id, customer_id, amount, payment_date, payment_method, reference_number, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [repaymentId, loan_id, loan.customer_id, pay, String(payment_date).trim(), payment_method, reference_number || null, req.user.sub]);
      const paymentId = await nextBusinessId(tx, "payments");
      await tx.run(`INSERT INTO payments
          (payment_id, loan_id, customer_id, type, amount, payment_date, payment_method, reference_number, recorded_by)
         VALUES (?, ?, ?, 'repayment', ?, ?, ?, ?, ?)`, [paymentId, loan_id, loan.customer_id, pay, String(payment_date).trim(), payment_method, reference_number || null, req.user.sub]);
      const newPaid = binary("+", money(loan.amount_paid), pay);
      const newBalance = binary("-", outstanding, pay);
      const settled = binary("<=", newBalance, CLOSING_EPSILON);
      const newStatus = settled ? 'completed' : loan.status;
      // A completed loan settles to exactly zero with amount_paid equal to
      // total_payable, so statements never show a stray fractional franc.
      await tx.run('UPDATE loans SET amount_paid = ?, outstanding_balance = ?, status = ? WHERE id = ?', [settled ? money(loan.total_payable) : newPaid, settled ? 0 : math("max", newBalance, 0), newStatus, loan_id]);
      if (binary("===", newStatus, 'completed')) {
        await tx.run('UPDATE repayment_schedules SET status = ? WHERE loan_id = ?', ['paid', loan_id]);
        await writeAudit({
          userId: req.user.sub,
          userName: req.user.name,
          action: 'LOAN_COMPLETED',
          description: `Loan ${loan.loan_id} completed.`,
          relatedRecord: `loan:${loan.loan_id}`
        }, tx);
      }
      await writeAudit({
        userId: req.user.sub,
        userName: req.user.name,
        action: 'REPAYMENT_RECORDED',
        description: `Recorded repayment ${repaymentId} of ${pay} RWF`,
        relatedRecord: `loan:${loan.loan_id}`
      }, tx);
      const updatedLoan = await tx.queryOne('SELECT * FROM loans WHERE id = ?', [loan_id]);
      return {
        repayment_id: repaymentId,
        loan: updatedLoan
      };
    });
    res.status(201).json(result);
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({
      error: e.message
    });
    handleError(res, e);
  }
});
export default router;

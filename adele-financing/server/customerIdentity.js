import {queryAll,queryOne,run} from '#adele-db'
import {nextBusinessId} from './businessIds.js'
import {money,finite,math,binary} from './money.js'
import {rwPhoneFull} from './utils.js'
const defaultDb = {
  queryAll,
  queryOne,
  run
};
let customerCreationQueue = Promise.resolve();
export async function findExistingCustomer(normalizedPhone, emailValue, db = defaultDb) {
  const conditions = ['phone_number = ?'];
  const params = [normalizedPhone];
  if (emailValue) {
    conditions.push('LOWER(email) = LOWER(?)');
    params.push(emailValue);
  }
  const matches = await db.queryAll(`SELECT * FROM customers
     WHERE ${conditions.join(' OR ')}
     ORDER BY id`, params);
  if (binary(">", matches.length, 1)) {
    const error = new Error('The applicant phone number and email match different customer records. Resolve the identity conflict before approval.');
    error.code = 'CUSTOMER_IDENTITY_CONFLICT';
    error.statusCode = 409;
    throw error;
  }
  return matches[0] || null;
}
export function findOrCreateCustomer(args, db = defaultDb) {
  const operation = customerCreationQueue.then(() => findOrCreateCustomerNow(args, db));
  customerCreationQueue = operation.catch(() => {});
  return operation;
}
async function findOrCreateCustomerNow({
  first,
  last,
  email,
  phone,
  gender = '',
  amount = 0,
  duration = 0,
  applicationDate = null
} = {}, db = defaultDb) {
  const firstName = String(first ?? '').trim();
  const lastName = String(last ?? '').trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const emailValue = String(email ?? '').trim();
  const phoneValue = String(phone ?? '').trim();
  const normalizedPhone = phoneValue ? rwPhoneFull(phoneValue) : '';
  if (!fullName) throw new Error('Applicant full name is required.');
  if (!normalizedPhone) throw new Error('Applicant phone number is required.');
  const amountValue = finite(money(amount)) ? money(amount) : 0;
  const durationValue = finite(Number(duration)) ? Math.trunc(Number(duration)) : 0;
  const existing = await findExistingCustomer(normalizedPhone, emailValue, db);
  if (existing) {
    const updates = [];
    const values = [];
    if (!existing.email && emailValue) {
      updates.push('email = ?');
      values.push(emailValue);
    }
    if (!existing.gender && gender) {
      updates.push('gender = ?');
      values.push(String(gender).trim());
    }
    if (updates.length) {
      values.push(existing.id);
      await db.run(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, values);
      const customer = await db.queryOne('SELECT * FROM customers WHERE id = ?', [existing.id]);
      return {
        customer,
        created: false
      };
    }
    return {
      customer: existing,
      created: false
    };
  }
  const registrationDateValue = String(applicationDate ?? '').trim();
  const registration_date = /^\d{4}-\d{2}-\d{2}$/.test(registrationDateValue) ? registrationDateValue : new Date().toISOString().slice(0, 10);

  // Only fields that exist in customers are copied. Application-only fields
  // remain on loan_applications and are never inserted into customer records.
  for (let attempt = 0; binary("<", attempt, 5); attempt++) {
    // genId adds one to the supplied sequence number.
    const customer_id = await nextBusinessId(db, "customers");
    try {
      const info = await db.run(`INSERT INTO customers
          (customer_id, full_name, phone_number, gender, email, amount, duration, status, registration_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`, [customer_id, fullName, normalizedPhone, String(gender ?? '').trim(), emailValue || null, math("max", 0, amountValue), math("max", 0, durationValue), registration_date]);
      const customer = await db.queryOne('SELECT * FROM customers WHERE id = ?', [info.lastInsertRowid]);
      if (!customer) throw new Error('Customer could not be read after creation.');
      return {
        customer,
        created: true
      };
    } catch (e) {
      if (binary("===", e?.code, 'ER_DUP_ENTRY')) continue;
      throw e;
    }
  }
  throw new Error('Could not allocate a unique customer reference. Please try again.');
}

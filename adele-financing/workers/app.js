import {resumeWorkerDatabase} from './database.js'
import './policy.js'
import express from 'express'
import {securityHeaders} from '../server/security.js'
import route0 from '../server/routes/auth.js'
import route1 from '../server/routes/customers.js'
import route2 from '../server/routes/loanProducts.js'
import route3 from '../server/routes/loanApplications.js'
import route4 from '../server/routes/loans.js'
import route5 from '../server/routes/repayments.js'
import route6 from '../server/routes/payments.js'
import route7 from '../server/routes/reports.js'
import route8 from '../server/routes/users.js'
import route9 from '../server/routes/settings.js'
import route10 from '../server/routes/auditLogs.js'
import route11 from '../server/routes/sessions.js'
import route12 from '../server/routes/dashboard.js'
import route13 from '../server/routes/finance.js'
export function createWorkerApp(){const app=express();app.set('trust proxy',false);app.use(securityHeaders);app.use((req,_res,next)=>{const id=req.headers['x-adele-worker-context'];delete req.headers['x-adele-worker-context'];try{return resumeWorkerDatabase(id,()=>{req.adeleProxy=Object.freeze({clientIp:req.headers['x-adele-worker-ip']});delete req.headers['x-adele-worker-ip'];next()})}catch{return next(new Error('Invalid internal request context'))}});app.use(express.json({limit:'256kb'}));app.use((req,res,next)=>{res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('CDN-Cache-Control','no-store');next()});
app.use('/api/auth',route0);
app.use('/api/customers',route1);
app.use('/api/loan-products',route2);
app.use('/api/loan-applications',route3);
app.use('/api/loans',route4);
app.use('/api/repayments',route5);
app.use('/api/payments',route6);
app.use('/api/reports',route7);
app.use('/api/users',route8);
app.use('/api/settings',route9);
app.use('/api/audit-logs',route10);
app.use('/api/sessions',route11);
app.use('/api/dashboard',route12);
app.use('/api/finance',route13);
app.use((_req,res)=>res.status(404).json({error:'Route not found.'}));app.use((error,_req,res,next)=>{if(res.headersSent)return next(error);const status=Number(error?.statusCode||error?.status);res.status(Number.isInteger(status)&&status>=400&&status<500?status:500).json({error:'Request unavailable or refused.'})});return app}

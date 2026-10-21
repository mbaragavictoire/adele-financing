import './policy.js'
import {httpServerHandler} from 'cloudflare:node'
import {createWorkerApp} from './app.js'
import {createWorkerHandler} from './handler.js'
import {openHyperdrive} from './hyperdrive.js'
const app=createWorkerApp()
app.listen(8080)
const bridge=httpServerHandler({port:8080})
export default {fetch:createWorkerHandler({dispatch:(request,env,ctx)=>bridge.fetch(request,env,ctx),openDatabase:openHyperdrive})}

export {PasswordCpu} from './password-cpu.js'

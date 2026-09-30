import dotenv from 'dotenv'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

import { OpenApi } from '@/helpers/server/OpenApi'

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }
export default OpenApi.handle

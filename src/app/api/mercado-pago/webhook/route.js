import { recibirWebhook } from '../../../../lib/mercado-pago/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  return recibirWebhook(request)
}

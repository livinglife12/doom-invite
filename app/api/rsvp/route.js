import { promises as fs } from 'fs'
import path from 'path'

// Stores RSVPs in data/rsvps.json when self-hosted with `next start`.
// On serverless hosts the file system is ephemeral: point NEXT_PUBLIC_RSVP_ENDPOINT at a real store instead.
const FILE = path.join(process.cwd(), 'data', 'rsvps.json')

async function readAll() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'))
  } catch {
    return []
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return Response.json({ ok: false, error: 'name required' }, { status: 400 })
  }
  const entry = {
    name: body.name.slice(0, 80),
    attending: body.attending === 'no' ? 'no' : 'yes',
    message: String(body.message || '').slice(0, 280),
    signature: typeof body.signature === 'string' && body.signature.length < 200000 ? body.signature : null,
    at: new Date().toISOString(),
  }
  const all = await readAll()
  all.push(entry)
  await fs.mkdir(path.dirname(FILE), { recursive: true })
  await fs.writeFile(FILE, JSON.stringify(all, null, 2))
  return Response.json({ ok: true })
}

// GET /api/rsvp?key=RSVP_ADMIN_KEY lists responses (without signatures).
export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key')
  if (!process.env.RSVP_ADMIN_KEY || key !== process.env.RSVP_ADMIN_KEY) {
    return Response.json({ ok: false }, { status: 401 })
  }
  const all = await readAll()
  return Response.json(all.map(({ signature, ...rest }) => rest))
}

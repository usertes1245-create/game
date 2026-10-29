// Project Dungeon: сервер комнат (Cloudflare Worker + Durable Object).
// Хозяин (первый игрок) считает игру, остальные шлют ему ввод и получают снимки состояния.
export class Room {
  constructor() { this.peers = new Map(); this.n = 0; this.host = null; }
  fetch(req) {
    const url = new URL(req.url), create = url.searchParams.get('create') === '1';
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    if (!create && this.peers.size === 0) { server.send(JSON.stringify({ t: 'noroom' })); server.close(); return new Response(null, { status: 101, webSocket: client }); }
    if (this.peers.size >= 4) { server.send(JSON.stringify({ t: 'full' })); server.close(); return new Response(null, { status: 101, webSocket: client }); }
    const id = this.n++;
    this.peers.set(id, server);
    if (this.host === null || !this.peers.has(this.host)) this.host = id;
    server.send(JSON.stringify({ t: 'hello', id, host: this.host }));
    server.addEventListener('message', (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      m.from = id;
      const d = JSON.stringify(m);
      if (id === this.host) { for (const [i, s] of this.peers) if (i !== id) { try { s.send(d); } catch {} } }
      else { try { this.peers.get(this.host)?.send(d); } catch {} }
    });
    server.addEventListener('close', () => {
      this.peers.delete(id);
      const d = JSON.stringify({ t: id === this.host ? 'hostleft' : 'leave', id });
      for (const s of this.peers.values()) { try { s.send(d); } catch {} }
      if (id === this.host) this.peers.clear();
    });
    return new Response(null, { status: 101, webSocket: client });
  }
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
      const code = (u.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (!code) return new Response('room required', { status: 400 });
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};

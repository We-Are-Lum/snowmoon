// The live editor's data, made at build time from a version's committed files (adaptations/<seed>/versions/<n>.json).
//   node scripts/editor-data.mjs            every adaptations/*/versions/*.json
// Writes public/editor/<adaptation>/v<n>/: data.json (every shot: its frame, set frame, camera, people, the scene's camera
// setups, lines, voices, plate, cast cards and full recipe), web copies of the pictures (frames 1280 px and 320 px thumbs,
// set frames, plates, cards; sharp when it is installed, else the files as committed) and the converted voice lines.
// Nothing is fetched and nothing is generated: a fork that clones the repo gets the same editor. public/editor is not committed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rel = (p) => path.join(ROOT, p);
const readJson = (p) => JSON.parse(fs.readFileSync(rel(p), 'utf8'));
const exists = (p) => fs.existsSync(rel(p));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(rel(p))).digest('hex');
let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.log('editor-data: sharp is not installed; pictures are copied as committed (larger)');
}

const MODELS = Object.fromEntries(readJson('config/models.json').models.map((m) => [m.id, m]));
// Existing converted takes per line (scripts/remix-takes.py), if committed.
const TAKES = exists('adaptations/fifteen-days/takes/takes.json') ? readJson('adaptations/fifteen-days/takes/takes.json').takes : {};
/** A recipe's endpoint to the allowlisted model it ran (config/models.json). */
function modelOf(endpoint) {
  if (!endpoint) return null;
  if (endpoint.startsWith('local')) return { id: 'none', name: 'No model: a local edit in code', licence: 'GPL-3.0, with the code', weights: null };
  const id = endpoint.includes('klein/4b') ? 'flux2-klein-4b' : endpoint.includes('qwen-image-edit') ? 'qwen-image-edit-2509' : endpoint.includes('z-image') ? 'z-image-turbo' : null;
  const m = id && MODELS[id];
  return m ? { id, name: m.repo ?? id, licence: m.license, weights: m.weights ?? null, host: endpoint } : { id: endpoint, name: endpoint, licence: 'unknown', weights: null, host: endpoint };
}

async function picture(src, dst, width, quality = 82) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) return;
  if (sharp) await sharp(rel(src)).resize({ width, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toFile(dst);
  else fs.copyFileSync(rel(src), dst);
}
const ext = () => (sharp ? '.jpg' : '.png');

for (const seed of fs.readdirSync(rel('adaptations'))) {
  const vdir = `adaptations/${seed}/versions`;
  if (!exists(vdir)) continue;
  for (const vf of fs.readdirSync(rel(vdir)).filter((f) => f.endsWith('.json'))) await build(readJson(`${vdir}/${vf}`));
}

async function build(V) {
  const OUT = rel(`public/editor/${V.adaptation}/v${V.version}`);
  const url = (p) => `/editor/${V.adaptation}/v${V.version}/${p}`;
  fs.mkdirSync(OUT, { recursive: true });
  const tl = readJson(V.timeline);
  const recipes = readJson(V.frames_recipe).images;
  const picks = Object.assign({}, ...V.picks.map(readJson));
  const board = readJson(V.board);
  const lines = Object.fromEntries(readJson(V.lines).lines.map((l) => [l.ref, l]));
  // Subtitles split a long line into chunks: join them back.
  const subs = {};
  for (const s of tl.subtitles || []) subs[s.cue] = subs[s.cue] ? `${subs[s.cue]} ${s.text}` : s.text;
  const sets = {};
  const setOf = (name) => (sets[name] ??= { set: readJson(`${V.sets}/${name}.json`), shots: exists(`${V.sets}/${name}.shots.json`) ? readJson(`${V.sets}/${name}.shots.json`) : {} });

  // A committed copy of a picture a recipe names (images-out/ is not committed; sent/ holds what was sent).
  const sentCopy = (file) => {
    if (!file) return null;
    const b = path.basename(file);
    for (const d of ['frames', 'edit-src', 'plates', 'cards']) if (file.includes(d === 'frames' ? 'pass3/' : d === 'edit-src' ? 'edit-src/' : d === 'plates' ? 'plates' : 'cards') && exists(`${V.sent}/${d}/${b}`)) return `${V.sent}/${d}/${b}`;
    if (file.startsWith('adaptations/') && exists(file)) return file;
    return null;
  };

  const starts = tl.shots.map((s) => s.at.offset);
  const end = Math.max(...tl.cues.map((c) => c.at.offset)) + (tl.tail_s || 0);
  const voices = tl.cues.filter((c) => c.track === 'voice').sort((a, b) => a.at.offset - b.at.offset);
  const shots = [];
  const copied = new Set();
  const copyOnce = async (src, name, width) => {
    const dst = path.join(OUT, name);
    if (!copied.has(name)) await picture(src, dst, width);
    copied.add(name);
    return url(name);
  };

  // A shot's id in its editor link: the cut's id, made safe for a URL ("9-game/PIT-D" -> "9-game-PIT-D") and unique.
  const used = new Set();
  const urlId = (id) => {
    const base = id.replace(/[^\w-]+/g, '-');
    let u = base;
    for (let k = 2; used.has(u); k++) u = `${base}-${k}`;
    used.add(u);
    return u;
  };

  for (const [i, s] of tl.shots.entries()) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : Math.max(from + 2, end);
    const fid = s.frame;
    const meta = board.frames[fid] || {};
    // Pictures made in code at cut time: lettering over a frame, the book's own picture, a device screen, black.
    const made = /^(lettered|framed|screen)-|\/black\.png$/.test(path.basename(s.image)) || s.image.endsWith('black.png');
    let base = made ? null : s.image;
    if (made && s.image.includes('lettered-')) base = picks[fid] ?? meta.reuse ?? null;
    const rid = base ? path.basename(base, '.png') : null;
    const r = rid ? recipes[rid] : null;
    const sent = base ? sentCopy(base) : null;
    const shot = {
      id: urlId(s.id),
      cutId: s.id,
      n: i + 1,
      from: +from.toFixed(2),
      to: +to.toFixed(2),
      frameId: fid,
      scene: meta.scene ?? null,
      setup: meta.setup ?? null,
      variant: meta.variant || null,
      size: meta.size ?? null,
      action: meta.action ?? null,
      who: meta.who ?? [],
      set: meta.set ?? null,
      made: made ? (s.image.includes('lettered-') ? 'lettering drawn in code over the frame' : s.image.includes('framed-') ? "the book's own picture, framed in code" : s.image.includes('screen-') ? "the book's words on a device, drawn in code" : 'black') : null,
      picture: s.picture,
      frame: null,
      thumb: null,
      setFrame: null,
      camera: null,
      plate: null,
      cards: [],
      recipe: null,
      lines: [],
    };
    if (sent) {
      shot.frame = await copyOnce(sent, `frames/${rid}${ext()}`, 1280);
      shot.thumb = await copyOnce(sent, `thumbs/${rid}${ext()}`, 320);
    }
    if (r) {
      const L = r.layers || {};
      // The set and camera the frame was drawn from (coverage frames record them; older frames name the set's shot).
      let cam = L.camera ? { cam: L.camera.cam, look: L.camera.look, fov: L.camera.fov, people: L.camera.people } : null;
      let setName = L.set ? path.basename(L.set.file, '.json') : meta.set;
      if (!cam && meta.layout && board.layouts?.[meta.layout]?.camera) cam = board.layouts[meta.layout].camera;
      if (!cam && L.camera?.key && setName) cam = setOf(setName).shots[L.camera.key] ?? null;
      if (cam && setName) shot.camera = { set: setName, key: L.camera?.key ?? meta.layout ?? null, ...cam };
      if (!shot.set && setName) shot.set = setName;
      if (L.set_frame?.file && exists(L.set_frame.file)) shot.setFrame = { src: await copyOnce(L.set_frame.file, `set/${path.basename(L.set_frame.file, '.png')}${ext()}`, 1280), mode: L.set_frame.mode, file: L.set_frame.file, sha256: L.set_frame.sha256 };
      const plateFile = L.plate?.file && sentCopy(L.plate.file);
      if (plateFile) shot.plate = { src: await copyOnce(plateFile, `plates/${path.basename(plateFile, '.png')}${ext()}`, 1024), name: L.plate.plate, file: L.plate.file, sha256: L.plate.sha256, source: L.plate.source ?? null };
      for (const c of L.cards || []) {
        const cf = sentCopy(c.file);
        if (cf) shot.cards.push({ src: await copyOnce(cf, `cards/${path.basename(cf, '.png')}${ext()}`, 768), who: path.basename(cf, '.png'), file: c.file, sha256: c.sha256, source: c.source ?? null });
      }
      // The chain back: an edit's source, a stage-one picture, each with its own recipe.
      const chain = [];
      const seen = new Set();
      const walk = (id) => {
        const x = recipes[id];
        if (!x || seen.has(id)) return;
        seen.add(id);
        chain.push({
          id,
          model: modelOf(x.endpoint),
          seed: x.seed ?? null,
          size: x.width ? `${x.width}x${x.height}` : null,
          cost_usd: x.cost_usd ?? 0,
          served_at: x.served_at ?? null,
          request_id: x.request_id ?? null,
          sha256: x.sha256 ?? null,
          kind: x.kind ?? null,
          note: x.note ?? null,
          prompt: x.prompt ?? null,
          references: (x.references || []).map((f) => ({ file: f.file, sha256: f.sha256 ?? null })),
        });
        for (const f of x.references || []) if (f.file.includes('pass3/') || f.file.includes('edit-src/')) walk(path.basename(f.file, '.png'));
      };
      walk(rid);
      shot.recipe = {
        id: rid,
        file: sent,
        sha256: r.sha256 ?? s.image_sha256,
        sentSha256: sent ? sha(sent) : null,
        prompt: r.prompt ?? chain.find((c) => c.prompt)?.prompt ?? null,
        set: L.set ?? null,
        chain,
        cost_usd: +chain.reduce((a, c) => a + (c.cost_usd || 0), 0).toFixed(4),
      };
    }
    // Lines that start while this shot is on screen.
    for (const c of voices) {
      if (c.at.offset < from - 0.01 || c.at.offset >= to - 0.01) continue;
      const l = lines[c.id];
      const voiceFile = c.stem;
      const tag = l?.tag ?? '';
      const book = /^book (c\d+-b\d+)/.exec(tag);
      shot.lines.push({
        cue: c.id,
        at: +c.at.offset.toFixed(2),
        speaker: l?.speaker ?? null,
        text: l?.text ?? subs[c.id] ?? null,
        by: book ? { kind: 'book', cite: book[1] } : /FID 6786/.test(tag) ? { kind: 'person', handle: V.author.handle, on: tag.split(' on ')[1] ?? null } : { kind: 'unknown' },
        note: l?.note ?? null,
        voice: exists(voiceFile) ? { src: await copyVoice(voiceFile, c.id), name: c.source?.voice ?? null, sha256: sha(voiceFile), file: voiceFile, model: c.source?.voice ? { id: 'chatterbox-vc', name: MODELS['chatterbox-vc']?.repo, licence: MODELS['chatterbox-vc']?.license } : null } : null,
        // The other existing converted takes of this line (scripts/remix-takes.py), for the storyboard.
        // The take the version itself uses is listed first and marked (owner, 2026-10-18: "keep all, with the chosen take listed first").
        takes: await Promise.all(
          (TAKES[c.id] ?? [])
            .filter((t) => exists(t.file))
            .map((t) => ({ ...t, inVersion: !!c.source?.voice && t.voice === c.source.voice }))
            .sort((a, b) => Number(b.inVersion) - Number(a.inVersion))
            .map(async (t) => ({ id: t.id, voice: t.voice, inVersion: t.inVersion, src: await copyTake(t.file, c.id, t.id), sha256: t.sha256, file: t.file, recipe: t.recipe, model: t.model, licence: t.licence })),
        ),
      });
    }
    shots.push(shot);
  }

  async function copyTake(file, cue, id) {
    const name = `takes/${cue}/${id}${path.extname(file)}`;
    const dst = path.join(OUT, name);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst)) fs.copyFileSync(rel(file), dst);
    return url(name);
  }

  async function copyVoice(file, cue) {
    const name = `voice/${cue}${path.extname(file)}`;
    const dst = path.join(OUT, name);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst)) fs.copyFileSync(rel(file), dst);
    return url(name);
  }

  // The scene's camera setups (presets): every coverage layout in the same set, with its camera.
  const presets = {};
  for (const [lid, l] of Object.entries(board.layouts || {})) {
    if (!l.camera || !l.set) continue;
    const used = Object.values(board.frames).find((f) => f.layout === lid);
    (presets[l.set] ??= []).push({ key: lid, setup: lid.replace(/^cov-[a-z]+-/, ''), size: l.size ?? used?.size ?? null, scene: used?.scene ?? null, cam: l.camera.cam, look: l.camera.look, fov: l.camera.fov, people: l.camera.people });
  }
  // The sets themselves, for the live 3D view.
  const setNames = [...new Set(shots.map((s) => s.camera?.set).filter(Boolean))];
  for (const n of setNames) fs.writeFileSync(path.join(OUT, `set-${n}.json`), JSON.stringify(setOf(n).set));

  const data = {
    about: `Made by scripts/editor-data.mjs from ${path.relative(ROOT, rel(`adaptations/${V.seed}/versions/${V.version}.json`))}; every file named here is committed.`,
    adaptation: V.adaptation,
    version: V.version,
    seed: V.seed,
    title: V.title,
    author: V.author,
    recipeFolder: `adaptations/${V.seed}`,
    sets: Object.fromEntries(setNames.map((n) => [n, url(`set-${n}.json`)])),
    presets: Object.fromEntries(setNames.map((n) => [n, presets[n] ?? []])),
    shots,
  };
  fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(data));
  const withCam = shots.filter((s) => s.camera).length;
  console.log(`editor-data: ${V.seed} v${V.version}: ${shots.length} shots (${withCam} with a camera, ${shots.filter((s) => s.lines.length).length} with lines), sets ${setNames.join(', ')} -> public/editor/${V.adaptation}/v${V.version}`);
}

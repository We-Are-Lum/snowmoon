/**
 * The owner's phone test for voice conversion in the browser (owner, 2026-10-22: "Voice in the browser:
 * yes, PR, owner-only test page first … Before anything else: test on my iPhone (WebGPU support, speed,
 * memory)"). What /voice-test downloads, all from media.snowmoon.party under voice/ (P6: nothing from
 * Hugging Face or a CDN), each file pinned by sha256. Uploaded by scripts/publish-voice-test.ts.
 *
 * - The model: Chatterbox VC's speech encoder and S3Gen decoder from onnx-community/chatterbox-ONNX
 *   @3cab09af388d3f02bba43443fce88c1f4525ac43 (model card: `license: mit`), weight-only int4 (MatMulNBits,
 *   block 32) made by the overnight spike (~/snowmoon-refs/voice-spike/scripts/to_q4.py, 2026-10-22).
 *   Not yet in config/models.json: the allowlist entry comes after the phone test (owner's order).
 * - The runtime: onnxruntime-web 1.30.0 (MIT), its WebGPU build and the wasm it loads.
 * - The test line: two finished lines already public in the repository, never a raw take. Zei's
 *   "Take it easy, you're my competition too." (b2-9, 3.40 s) is converted into Bai's voice, with Bai's own
 *   published line b3-13 (9.27 s) as her reference. Bai's designed reference clip (bai-v3b.ref.wav) is
 *   not used: its record says "Placeholder for the voice test only; never published".
 *
 * Every prefix carries a sha256, so the objects are immutable and cached for a year.
 */
export const VOICE_TEST_MEDIA = 'voice';

export interface VoiceFile {
  /** Key under media.snowmoon.party/voice/. */
  key: string;
  sha256: string;
  bytes: number;
}

/** The four model files, under the first 12 hex of the sha256 of their `sha256  name` lines, sorted by name. */
const MODEL = 'chatterbox-onnx-q4/025459dcbd7f';
/** The runtime files, likewise. */
const RUNTIME = 'onnxruntime-web/1.30.0-f6c7858a819d';

export const VOICE_TEST = {
  model: {
    name: 'Chatterbox VC (ONNX, int4)',
    source: 'onnx-community/chatterbox-ONNX@3cab09af388d3f02bba43443fce88c1f4525ac43, int4 by the spike (to_q4.py)',
    encoder: { key: `${MODEL}/speech_encoder_q4.onnx`, sha256: '15a0836af92aa5b715bf18802b58467e813ae85ec63801a2e4d3a1235addbf70', bytes: 1199468 },
    encoderData: { key: `${MODEL}/speech_encoder_q4.onnx_data`, sha256: '6b05190a4960ece7c47dbb564dd444252b01acb72ce95673def2dd4f4f643b12', bytes: 178920064 },
    decoder: { key: `${MODEL}/conditional_decoder_q4.onnx`, sha256: 'e39e38100f0e2431725c3ddf00def31eb40dd4285fa82ee3fd83d7b50b98087e', bytes: 6772951 },
    decoderData: { key: `${MODEL}/conditional_decoder_q4.onnx_data`, sha256: '402c0c85f3f048b293fcad68fd565e0ec2f02eea849120c3bc0b0536b4467157', bytes: 218864512 },
  },
  runtime: {
    name: 'onnxruntime-web 1.30.0',
    /** wasmPaths: ORT finds its .mjs and .wasm by these names under this prefix. */
    prefix: `${RUNTIME}/`,
    ort: { key: `${RUNTIME}/ort.webgpu.min.mjs`, sha256: '3dffff71811bc13a3a3d9591c57ca5ee5735b8f5f3eaf789510b02bb040ae3a0', bytes: 66349 },
    glue: { key: `${RUNTIME}/ort-wasm-simd-threaded.asyncify.mjs`, sha256: '3d1c85995364bb643302fc6fd877a0c3ba5ae72401815e0f24828a53d9191e28', bytes: 53057 },
    wasm: { key: `${RUNTIME}/ort-wasm-simd-threaded.asyncify.wasm`, sha256: '39f9f0894d478800487ed9f7dbe92618498db320cf55c8e3d89adff8dce658da', bytes: 26781914 },
  },
  line: {
    label: 'Zei, b2-9: "Take it easy, you\'re my competition too."',
    repo: 'scenes-out/fifteen-days/cuts/coverage-v6/stems/b2-9.wav',
    key: 'test/fifteen-days-b2-9-c91ef0dff1fe.wav',
    sha256: 'c91ef0dff1fe757562771121def63a1bc31aa7f7d7a26b88f472aa43dad76c10',
    bytes: 652060,
  },
  reference: {
    label: 'Bai, b3-13 (her published line, as the voice reference)',
    repo: 'scenes-out/fifteen-days/cuts/coverage-v6/stems/b3-13.wav',
    key: 'test/fifteen-days-b3-13-d00fd13e65fd.wav',
    sha256: 'd00fd13e65fdf0ef815f7d82af9210dc45f6f0e375677a254ad8b41d6c18cac3',
    bytes: 1780316,
  },
} as const;

/** Every file, for the publish script and the page. */
export const VOICE_TEST_FILES: VoiceFile[] = [
  VOICE_TEST.model.encoder,
  VOICE_TEST.model.encoderData,
  VOICE_TEST.model.decoder,
  VOICE_TEST.model.decoderData,
  VOICE_TEST.runtime.ort,
  VOICE_TEST.runtime.glue,
  VOICE_TEST.runtime.wasm,
  VOICE_TEST.line,
  VOICE_TEST.reference,
];

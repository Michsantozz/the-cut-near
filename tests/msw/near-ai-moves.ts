import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { http, HttpResponse } from "msw";
import { signedMoveText } from "@/features/moves/model/relay";

// A fake NEAR AI Cloud for the move relay: a model TEE with an Ed25519 key that signs
// `<model>:<sha256(request)>:<sha256(response)>` over the exact bytes it received and sent.

export const BASE = "https://cloud-api.near.ai/v1";

export type FakeMoveCloudOptions = {
  model?: string;
  /** The move content the model answers with, per request body. Default: a hold. */
  content?: (requestBody: string) => string;
  /** Every completion answers 503. */
  down?: boolean;
  /** Sign the hash of another response than the one sent. */
  tamper?: boolean;
  /** Sign with a key that is not the attested one. */
  rogue?: boolean;
  signatureKind?: string;
  /** Called after a completion is served, before its signature is fetched. */
  onCompletion?: (requestBody: string) => void;
};

const newKey = () => {
  const secretKey = ed25519.utils.randomSecretKey();
  return { secretKey, publicKey: bytesToHex(ed25519.getPublicKey(secretKey)) };
};

export function fakeMoveCloud(options: FakeMoveCloudOptions = {}) {
  const model = options.model ?? "z-ai/glm-5.3-flash";
  const modelKey = newKey();
  const rogueKey = newKey();
  const chats = new Map<string, { request: string; response: string }>();
  const posted: { bytes: Uint8Array; headers: Headers }[] = [];
  const calls = { chat: 0, signature: 0 };

  const handlers = [
    http.post(`${BASE}/chat/completions`, async ({ request }) => {
      const n = ++calls.chat;
      if (options.down) return HttpResponse.json({ error: { message: "upstream unavailable" } }, { status: 503 });
      const bytes = new Uint8Array(await request.arrayBuffer());
      posted.push({ bytes, headers: request.headers });
      const body = new TextDecoder().decode(bytes);
      const id = `chatcmpl-move-${n}`;
      const content = options.content?.(body) ?? JSON.stringify({ move: "hold", target: null, amount: "0", heir: null, reason: "I keep my powder dry." });
      // Pretty-printed with a trailing newline on purpose: the signature covers these exact bytes.
      const message = { role: "assistant", content, reasoning_content: "The board first, then the move." };
      const response = `${JSON.stringify({ id, object: "chat.completion", model, choices: [{ index: 0, finish_reason: "stop", message }], usage: { prompt_tokens: 900, completion_tokens: 80, total_tokens: 980 } }, null, 2)}\n`;
      chats.set(id, { request: body, response });
      options.onCompletion?.(body);
      return new HttpResponse(response, { headers: { "content-type": "application/json" } });
    }),
    http.get(`${BASE}/signature/:id`, ({ params, request }) => {
      calls.signature++;
      const chat = chats.get(String(params.id));
      if (!chat) return HttpResponse.json({ error: { message: "Chat id not found or expired" } }, { status: 404 });
      const algo = new URL(request.url).searchParams.get("signing_algo");
      if (algo !== "ed25519") return HttpResponse.json({ error: { message: `unexpected signing_algo ${algo}` } }, { status: 400 });
      const text = signedMoveText(model, chat.request, options.tamper ? `${chat.response} ` : chat.response);
      const key = options.rogue ? rogueKey : modelKey;
      const signature = bytesToHex(ed25519.sign(new TextEncoder().encode(text), key.secretKey));
      return HttpResponse.json({ text, signature, signing_address: key.publicKey, signing_algo: "ed25519", signature_kind: options.signatureKind ?? "provider_tee" });
    }),
  ];

  return { model, signer: modelKey.publicKey, handlers, calls, posted, chats };
}

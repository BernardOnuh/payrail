import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ApiError } from "../apiClient.js";
import { SignerRefusal } from "../signer/signer.js";

export type ToolResult = CallToolResult;

/** Concise success result: returns `{ ok: true, ...data }` as text JSON. */
export function okResult(data: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: true, ...data }, null, 2) }],
  };
}

/** Structured failure result (marked isError so the model sees it as a tool error). */
export function errResult(errorCode: string, message: string, extra: Record<string, unknown> = {}): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ ok: false, errorCode, message, ...extra }, null, 2) }],
  };
}

/** Map any thrown error to a structured ToolResult. */
export function fromError(e: unknown): ToolResult {
  if (e instanceof ApiError) {
    return errResult(e.code, e.message, {
      status: e.status,
      requestId: e.requestId,
      details: e.details,
    });
  }
  if (e instanceof SignerRefusal) {
    return errResult(e.code, e.message, e.data);
  }
  return errResult("INTERNAL_ERROR", e instanceof Error ? e.message : String(e));
}
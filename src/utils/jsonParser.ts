/**
 * Parse JSON from LLM responses with bulletproof error handling
 */
function parseLLMJson(
    response: any,
    options: Record<string, any> | null | undefined = {}
): any {
    // BULLETPROOF: Handle null/undefined/invalid options
    if (!options || typeof options !== "object" || Array.isArray(options)) options = {};

    const {
        attemptFix = true,
        maxBlocks = 8,
        preferFirst = true,
        allowPartial = false,
        // NEW:
        maxUnwrapDepth = 6,
        maxDecodeDepth = 3,
        unwrapKeys = [
            "raw_response", // <-- IMPORTANT for your sample
            "rawResponse",
            "response",
            "data",
            "result",
            "output",
            "content",
            "message",
            "text",
            "completion",
        ],
        // If true, prefer raw_response over response when both exist
        preferRawResponse = true,
    } = options as any;

    if (response === null || response === undefined) return null;

    // --- NEW: If it's already a parsed object/array, don't String() it ---
    // Try to unwrap useful fields directly first.
    const isPlainObject = (x: any) =>
        x && typeof x === "object" && !Array.isArray(x) && Object.prototype.toString.call(x) === "[object Object]";

    const isLikelyLLMMessageArray = (x: any) =>
        Array.isArray(x) && x.length > 0 && (typeof x[0] === "string" || isPlainObject(x[0]));

    // Pull text from common SDK shapes (OpenAI/Anthropic/etc.)
    const coerceToTextIfNeeded = (x: any): string | null => {
        if (typeof x === "string") return x;

        // Already JSON object? Return a stable JSON string for parsing
        if (isPlainObject(x) || Array.isArray(x)) {
            // Try to extract a good text field first (common in SDKs)
            // e.g., { content: [{type:'text', text:'...'}] } or { message: { content: '...' } }
            const extracted = extractTextFromKnownShapes(x);
            if (extracted) return extracted;

            // Else stringify safely
            try {
                return JSON.stringify(x);
            } catch {
                return null;
            }
        }

        // Anything else: try String() fallback
        try {
            return String(x);
        } catch {
            return null;
        }
    };

    const extractTextFromKnownShapes = (x: any): string | null => {
        try {
            // Anthropic-ish: { content: [{ type: 'text', text: '...' }] }
            if (x?.content && Array.isArray(x.content)) {
                const texts = x.content
                    .map((p: any) => (typeof p === "string" ? p : p?.text))
                    .filter(Boolean);
                if (texts.length) return texts.join("\n");
            }

            // OpenAI-ish: { choices: [{ message: { content: "..." } }] }
            if (x?.choices && Array.isArray(x.choices)) {
                const parts = x.choices
                    .map((c: any) => c?.message?.content ?? c?.delta?.content ?? c?.text)
                    .filter(Boolean);
                if (parts.length) return parts.join("\n");
            }

            // Generic: { message: "..." } or { text: "..." }
            if (typeof x?.message === "string") return x.message;
            if (typeof x?.text === "string") return x.text;

            // If it’s an array of strings/objects, join best-effort
            if (isLikelyLLMMessageArray(x)) {
                const parts = x
                    .map((p: any) => (typeof p === "string" ? p : p?.text ?? p?.message ?? p?.content))
                    .filter(Boolean);
                if (parts.length) return parts.join("\n");
            }
        } catch { }
        return null;
    };

    // Turn input into a workable string
    const text = coerceToTextIfNeeded(response);
    if (!text || text.trim().length === 0) return null;

    // Cache for performance (NEW: move outside helper closures is fine, but keep per-call ok)
    const jsonCache = new Map<string, string>();

    // --- JSON fixups ---
    const fixCommonJsonIssues = (jsonStr: string) => {
        if (jsonCache.has(jsonStr)) return jsonCache.get(jsonStr)!;

        let fixed = jsonStr;

        fixed = fixed.replace(/^\uFEFF/, "");

        // Remove comments
        fixed = fixed.replace(/\/\/.*$/gm, "");
        fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, "");
        fixed = fixed.replace(/^\s*#.*$/gm, "");

        // Normalize smart quotes
        fixed = fixed
            .replace(/[“”]/g, '"')
            .replace(/[‘’]/g, "'");

        // Remove trailing commas
        fixed = fixed.replace(/,(\s*[}\]])/g, "$1");
        fixed = fixed.replace(/,\s*$/g, "");

        // Unquoted keys
        fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][\w\-\.]*)\s*:/g, '$1"$2":');

        // Convert single quotes to double quotes carefully (best-effort)
        fixed = fixed.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"');

        // Python booleans/null
        fixed = fixed.replace(/\bTrue\b/g, "true");
        fixed = fixed.replace(/\bFalse\b/g, "false");
        fixed = fixed.replace(/\bNone\b/g, "null");
        fixed = fixed.replace(/\bundefined\b/g, "null");

        // Handle ellipsis
        fixed = fixed.replace(/\.\.\./g, "");
        fixed = fixed.replace(/…/g, "");

        // Allow partial/truncated content
        if (allowPartial) {
            const quoteCount = (fixed.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) fixed += '"';
        }

        jsonCache.set(jsonStr, fixed);
        return fixed;
    };

    // --- NEW: decode loop for double-encoded JSON ---
    // Example: "\"{\\\"a\\\":1}\"" => "{ \"a\": 1 }"
    const decodeJsonStringLoop = (value: any, depth = 0): any => {
        if (depth >= maxDecodeDepth) return value;
        if (typeof value !== "string") return value;

        const s = value.trim();

        // If it's a quoted JSON string, try JSON.parse repeatedly
        // (common when providers wrap JSON inside a JSON string)
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            try {
                const parsed = JSON.parse(s);
                return decodeJsonStringLoop(parsed, depth + 1);
            } catch {
                return value;
            }
        }

        // If it looks like JSON, try parse
        if (s.startsWith("{") || s.startsWith("[")) {
            try {
                const parsed = JSON.parse(s);
                return decodeJsonStringLoop(parsed, depth + 1);
            } catch {
                return value;
            }
        }

        return value;
    };

    // Enhanced JSON extraction (same idea as yours)
    const extractJson = (t: string): string[] => {
        const results: Array<{ content: string; priority: number }> = [];
        let match: RegExpExecArray | null;

        const jsonBlockPattern = /```(?:json|JSON)\s*\n?([\s\S]*?)\n?```/g;
        while ((match = jsonBlockPattern.exec(t)) !== null) {
            if (results.length >= maxBlocks) break;
            const content = match[1]?.trim();
            if (content) results.push({ content, priority: 1 });
        }

        const codeBlockPattern = /```\s*\n?([\s\S]*?)\n?```/g;
        while ((match = codeBlockPattern.exec(t)) !== null) {
            if (results.length >= maxBlocks) break;
            const content = match[1]?.trim();
            if (content && (content.startsWith("{") || content.startsWith("["))) {
                results.push({ content, priority: 2 });
            }
        }

        const inlinePattern = /`([^`]+)`/g;
        while ((match = inlinePattern.exec(t)) !== null) {
            if (results.length >= maxBlocks) break;
            const content = match[1]?.trim();
            if (content && (content.startsWith("{") || content.startsWith("["))) {
                results.push({ content, priority: 3 });
            }
        }

        // Fallback: boundary detection (more reliable than regex-nesting for real-world)
        const bounded = findJsonBoundaries(t);
        if (bounded) results.push({ content: bounded.trim(), priority: 4 });

        if (preferFirst) results.sort((a, b) => a.priority - b.priority);

        // unique + cap
        const seen = new Set<string>();
        const out: string[] = [];
        for (const r of results) {
            if (!seen.has(r.content)) {
                seen.add(r.content);
                out.push(r.content);
            }
            if (out.length >= maxBlocks) break;
        }
        return out;
    };

    // --- Improved boundary detection: supports " and ' strings ---
    const findJsonBoundaries = (t: string): string | null => {
        let start = -1;
        let end = -1;
        let depth = 0;

        let inDq = false; // "
        let inSq = false; // '
        let escapeNext = false;

        for (let i = 0; i < t.length; i++) {
            const ch = t[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            if (ch === "\\") {
                escapeNext = true;
                continue;
            }

            if (ch === '"' && !inSq) {
                inDq = !inDq;
                continue;
            }
            if (ch === "'" && !inDq) {
                inSq = !inSq;
                continue;
            }

            if (!inDq && !inSq) {
                if (ch === "{" || ch === "[") {
                    if (start === -1) start = i;
                    depth++;
                } else if (ch === "}" || ch === "]") {
                    depth--;
                    if (depth === 0 && start !== -1) {
                        end = i + 1;
                        break;
                    }
                }
            }
        }

        if (start !== -1 && end !== -1) return t.substring(start, end);

        if (allowPartial && start !== -1) {
            // Best-effort closure
            return t.substring(start);
        }
        return null;
    };

    const tryParseJson = (jsonStr: string) => {
        if (!jsonStr || jsonStr.trim().length === 0) {
            return { success: false, data: null, error: "Empty JSON string" };
        }

        let clean = jsonStr.trim();

        // Direct parse
        try {
            const parsed = JSON.parse(clean);
            return { success: true, data: decodeJsonStringLoop(parsed), error: null };
        } catch { }

        if (attemptFix) {
            const bounded = findJsonBoundaries(clean);
            if (bounded) {
                try {
                    const parsed = JSON.parse(bounded);
                    return { success: true, data: decodeJsonStringLoop(parsed), error: null };
                } catch { }
            }

            clean = fixCommonJsonIssues(clean);

            try {
                const parsed = JSON.parse(clean);
                return { success: true, data: decodeJsonStringLoop(parsed), error: null };
            } catch { }

            const extracted = findJsonBoundaries(clean);
            if (extracted) {
                try {
                    const parsed = JSON.parse(extracted);
                    return { success: true, data: decodeJsonStringLoop(parsed), error: null };
                } catch { }
            }
        }

        return { success: false, data: null, error: "Failed to parse JSON after all attempts" };
    };

    // --- NEW: smarter unwrapping (supports raw_response, and tries keys list) ---
    // Detect if object is a "final" agent response structure that should NOT be unwrapped further
    const isFinalAgentResponse = (obj: any): boolean => {
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
        // Agent responses have "status" field with "result" or "message"
        // e.g., { status: "success", result: {...}, metadata: {...} }
        const hasStatus = "status" in obj && (obj.status === "success" || obj.status === "error");
        const hasResultOrMessage = "result" in obj || "message" in obj;
        return hasStatus && hasResultOrMessage;
    };

    const unwrapResponse = (data: any) => {
        let current = data;
        for (let depth = 0; depth < maxUnwrapDepth; depth++) {
            if (!current || typeof current !== "object") break;

            // STOP unwrapping if we hit a final agent response structure
            // This preserves { status, result, metadata } for the UI
            if (isFinalAgentResponse(current)) {
                break;
            }

            // Prefer raw_response over response when both exist
            if (preferRawResponse && typeof current?.raw_response === "string") {
                const parsed = tryParseJson(current.raw_response);
                if (parsed.success) {
                    current = parsed.data;
                    continue;
                }
            }

            // Try unwrapKeys in order
            let advanced = false;
            for (const k of unwrapKeys) {
                if (current && Object.prototype.hasOwnProperty.call(current, k) && current[k] != null) {
                    const v = current[k];

                    if (typeof v === "string") {
                        const parsed = tryParseJson(v);
                        if (parsed.success) {
                            current = parsed.data;
                            advanced = true;
                            break;
                        }
                    } else if (typeof v === "object") {
                        current = v;
                        advanced = true;
                        break;
                    }
                }
            }

            if (!advanced) break;
        }
        return current;
    };

    // FAST PATH: json code block
    try {
        const m = text.match(/```json\s*\n([\s\S]*?)\n```/);
        if (m) {
            const extracted = m[1].trim();
            const parsed = tryParseJson(extracted);
            if (parsed.success) return unwrapResponse(parsed.data);
        }
    } catch { }

    // Try whole text first
    const direct = tryParseJson(text);
    if (direct.success) return unwrapResponse(direct.data);

    // Else extract candidates
    const candidates = extractJson(text).sort((a, b) => b.length - a.length);
    for (const c of candidates) {
        const r = tryParseJson(c);
        if (r.success) return unwrapResponse(r.data);
    }

    // Final fallback
    if (attemptFix) {
        const aggressive = findJsonBoundaries(text);
        if (aggressive) {
            const r = tryParseJson(aggressive);
            if (r.success) return unwrapResponse(r.data);
        }
    }

    return {
        success: false,
        data: null,
        error: "No valid JSON found in the response",
        rawJson: null,
    };
}

export default parseLLMJson;
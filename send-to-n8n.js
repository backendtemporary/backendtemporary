/**
 * ==================================================================
 * SEND FILE TO N8N WEBHOOK
 * ==================================================================
 *
 * Sends a local file to the n8n operations assistant webhook using
 * multipart/form-data with proper binary handling.
 *
 * USAGE:
 *   node backend/send-to-n8n.js <file-path>
 *
 * EXAMPLES:
 *   node backend/send-to-n8n.js ./data/report.xlsx
 *   node backend/send-to-n8n.js "C:\Users\abdal\Documents\invoice.pdf"
 *   node backend/send-to-n8n.js ../frontend/src/App.jsx
 *
 * The webhook receives:
 *   - file        : the binary file (multipart field)
 *   - metadata    : JSON string with original_source, filename, extension
 * ==================================================================
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { basename, extname, resolve } from 'path';

// ============================================
// CONFIGURATION
// ============================================

const WEBHOOK_URL = process.env.N8N_WEBHOOK_TEST_URL;

// ============================================
// MULTIPART FORM-DATA BUILDER (zero dependencies)
// ============================================

/**
 * Builds a multipart/form-data body from fields and file buffers.
 * Returns { body: Buffer, contentType: string }.
 */
function buildMultipart(fields, file) {
    const boundary = `----AntigravityBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
    const CRLF = '\r\n';
    const parts = [];

    // Add text / JSON fields
    for (const [key, value] of Object.entries(fields)) {
        parts.push(
            Buffer.from(
                `--${boundary}${CRLF}` +
                `Content-Disposition: form-data; name="${key}"${CRLF}` +
                `Content-Type: application/json${CRLF}${CRLF}` +
                `${typeof value === 'string' ? value : JSON.stringify(value)}${CRLF}`
            )
        );
    }

    // Add binary file field
    parts.push(
        Buffer.from(
            `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="file"; filename="${file.name}"${CRLF}` +
            `Content-Type: application/octet-stream${CRLF}` +
            `Content-Transfer-Encoding: binary${CRLF}${CRLF}`
        )
    );
    parts.push(file.buffer);           // raw binary — no encoding conversion
    parts.push(Buffer.from(CRLF));

    // Closing boundary
    parts.push(Buffer.from(`--${boundary}--${CRLF}`));

    return {
        body: Buffer.concat(parts),
        contentType: `multipart/form-data; boundary=${boundary}`,
    };
}

// ============================================
// MAIN
// ============================================

async function main() {
    // --- Validate CLI argument ---
    const filePath = process.argv[2];

    if (!filePath) {
        console.error('❌ Usage: node send-to-n8n.js <file-path>');
        process.exit(1);
    }

    const absolutePath = resolve(filePath);

    if (!existsSync(absolutePath)) {
        console.error(`❌ File not found: ${absolutePath}`);
        process.exit(1);
    }

    const stats = statSync(absolutePath);
    if (!stats.isFile()) {
        console.error(`❌ Path is not a file: ${absolutePath}`);
        process.exit(1);
    }

    // --- Read file as raw binary buffer ---
    const fileBuffer = readFileSync(absolutePath);   // returns a Buffer (binary-safe)
    const fileName = basename(absolutePath);
    const fileExt = extname(absolutePath).replace(/^\./, '');  // without leading dot

    console.log(`📁 File     : ${fileName}`);
    console.log(`📐 Size     : ${(fileBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`🏷️  Extension: ${fileExt || '(none)'}`);
    console.log(`🌐 Endpoint : ${WEBHOOK_URL}\n`);

    // --- Build metadata JSON ---
    const metadata = JSON.stringify({
        original_source: 'antigravity',
        filename: fileName,
        extension: fileExt,
    });

    // --- Build multipart body ---
    const { body, contentType } = buildMultipart(
        { metadata },          // JSON fields
        { name: fileName, buffer: fileBuffer }  // binary file
    );

    // --- Send request ---
    console.log('🚀 Sending to n8n webhook...\n');

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': contentType },
            body,
        });

        const responseText = await response.text();

        if (response.ok) {
            console.log(`✅ Success (${response.status} ${response.statusText})`);
        } else {
            console.error(`⚠️  Server responded with ${response.status} ${response.statusText}`);
        }

        if (responseText) {
            console.log(`📨 Response:\n${responseText}`);
        }
    } catch (err) {
        console.error(`❌ Request failed: ${err.message}`);
        process.exit(1);
    }
}

main();

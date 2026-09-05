import fs from 'fs';

import { isValidRunFileName, resolveResultsDirectories } from '@/lib/lsh-runs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

type SsePayload = Record<string, string | number | boolean | null>;

export async function GET() {
    const resultsDirectories = resolveResultsDirectories();
    if (resultsDirectories.length === 0) {
        return new Response('LSH results directory not found.', { status: 404 });
    }

    const encoder = new TextEncoder();
    const watchers: fs.FSWatcher[] = [];
    let keepAliveTimer: NodeJS.Timeout | null = null;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const safeSend = (eventName: string, payload: SsePayload) => {
                try {
                    controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`));
                } catch (error) {
                    console.error('Failed to send SSE payload for LSH runs.', error);
                }
            };

            safeSend('ready', { at: new Date().toISOString() });

            keepAliveTimer = setInterval(() => {
                safeSend('ping', { at: new Date().toISOString() });
            }, 20000);

            try {
                for (const directory of resultsDirectories) {
                    watchers.push(fs.watch(directory, (_eventType, fileName) => {
                        const candidate = (fileName || '').toString();
                        if (!candidate || !isValidRunFileName(candidate)) {
                            return;
                        }
                        safeSend('runs_updated', {
                            fileName: candidate,
                            at: new Date().toISOString(),
                        });
                    }));
                }
            } catch (error) {
                safeSend('error', { message: 'Failed to watch LSH results directory.' });
                console.error('Failed to watch LSH results directory for SSE updates.', error);
            }
        },
        cancel() {
            if (keepAliveTimer) {
                clearInterval(keepAliveTimer);
                keepAliveTimer = null;
            }
            for (const watcher of watchers.splice(0)) {
                watcher.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}

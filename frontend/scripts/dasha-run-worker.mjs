const [, , origin, runId] = process.argv;

if (!origin || !runId) {
    process.exit(1);
}

try {
    const response = await fetch(`${origin}/api/dasha-runs/${runId}/execute`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Dasha worker failed for ${runId}: ${response.status} ${text}`);
        process.exit(1);
    }
} catch (error) {
    console.error(`Dasha worker failed for ${runId}:`, error);
    process.exit(1);
}

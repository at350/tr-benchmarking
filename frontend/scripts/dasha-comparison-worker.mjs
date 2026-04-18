const [, , origin, comparisonId] = process.argv;

if (!origin || !comparisonId) {
    process.exit(1);
}

try {
    const response = await fetch(`${origin}/api/dasha-comparisons/${comparisonId}/execute`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`Dasha comparison worker failed for ${comparisonId}: ${response.status} ${text}`);
        process.exit(1);
    }
} catch (error) {
    console.error(`Dasha comparison worker failed for ${comparisonId}:`, error);
    process.exit(1);
}

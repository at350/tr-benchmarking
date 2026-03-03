const fs = require('fs');
const path = require('path');

const RUN_FILE_NAME_PATTERN = /^run_\d{8}_\d{6}\.json$/;

function resolveResultsDirectories() {
    const candidates = [
        path.resolve(process.cwd(), '../lsh/results'),
        path.resolve(process.cwd(), 'lsh/results'),
        path.resolve(process.cwd(), '../lsh-IRAC/results'),
        path.resolve(process.cwd(), 'lsh-IRAC/results'),
    ];
    return candidates.filter(candidate => fs.existsSync(candidate));
}

const dirs = resolveResultsDirectories();
console.log("Directories:", dirs);

dirs.forEach(dir => {
    const files = fs.readdirSync(dir).filter(f => RUN_FILE_NAME_PATTERN.test(f));
    console.log(`Files in ${dir}:`, files);
    files.forEach(f => {
        const fullPath = path.join(dir, f);
        try {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const data = JSON.parse(raw);
            console.log(`Successfully parsed ${f}`);
        } catch (e) {
            console.log(`Error parsing ${f}:`, e.message);
        }
    });
});

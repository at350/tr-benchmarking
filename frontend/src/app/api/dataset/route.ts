import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

type DatasetMode = 'supergpqa' | 'prbench';
type CsvRow = Record<string, string>;

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const datasetParam = (searchParams.get('dataset') || 'supergpqa').toLowerCase();
        const dataset: DatasetMode = datasetParam === 'prbench' ? 'prbench' : 'supergpqa';

        if (dataset === 'prbench') {
            const csvPath = resolveDatasetPath([
                path.join(process.cwd(), '../datasets/prbench/legal-data.csv'),
                path.join(process.cwd(), 'datasets/prbench/legal-data.csv')
            ]);

            if (!csvPath) {
                return NextResponse.json({ error: 'Dataset file not found' }, { status: 404 });
            }

            const fileContent = fs.readFileSync(csvPath, 'utf-8');
            const records = parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                relax_quotes: true,
            }) as CsvRow[];

            const normalizedData = records.map((record, index) => {
                const turns = parseInt(record.turns, 10) || 0;
                const prompts: string[] = [];
                const responses: string[] = [];

                for (let i = 0; i < turns; i++) {
                    prompts.push(record[`prompt_${i}`] || '');
                    responses.push(record[`response_${i}`] || '');
                }

                return {
                    id: record.task || `${index}`,
                    turns,
                    field: record.field,
                    topic: record.topic,
                    rubric: record.rubric,
                    scratchpad: record.scratchpad,
                    prompts,
                    responses
                };
            });

            return NextResponse.json({ data: normalizedData });
        }

        const csvPath = resolveDatasetPath([
            path.join(process.cwd(), '../datasets/supergpqa/SuperGPQA Law Data.csv'),
            path.join(process.cwd(), 'datasets/supergpqa/SuperGPQA Law Data.csv'),
        ]);

        if (!csvPath) {
            return NextResponse.json({ error: 'Dataset file not found' }, { status: 404 });
        }

        const fileContent = fs.readFileSync(csvPath, 'utf-8');

        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            relax_quotes: true,
        }) as CsvRow[];

        // The `options` column is a Python list literal such as "['A', 'B']",
        // so it is parsed by hand rather than with JSON.parse.
        const normalizedData = records.map((record) => {
            let choices: string[];
            try {
                choices = parsePythonList(record.options);
            } catch (e) {
                console.error('Failed to parse options for id:', record.uuid, e);
                choices = [record.options];
            }

            return {
                id: record.uuid,
                question: record.question,
                choices: choices,
                answer: record.answer,
                answer_letter: record.answer_letter,
                discipline: record.discipline,
                subfield: record.subfield,
                difficulty: record.difficulty,
                ...(record.num_options != null && { num_options: Number(record.num_options) }),
                ...(record.law_system != null && record.law_system !== '' && { law_system: String(record.law_system) }),
            };
        });

        // Only return Law questions (no other disciplines/categories)
        const lawOnly = normalizedData.filter(
            (row: { discipline?: string }) => String(row.discipline || '').toLowerCase() === 'law'
        );

        return NextResponse.json({ data: lawOnly });
    } catch (error) {
        console.error('Error loading dataset:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

function resolveDatasetPath(paths: string[]): string | null {
    for (const candidate of paths) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function parsePythonList(str: string): string[] {
    str = str.trim();
    if (str.startsWith('[') && str.endsWith(']')) {
        str = str.slice(1, -1);
    }

    if (!str) return [];

    const result: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    let escape = false;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (escape) {
            current += char;
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }

        if (inQuote) {
            if (char === quoteChar) {
                inQuote = false;
                result.push(current);
                current = '';
                quoteChar = '';
            } else {
                current += char;
            }
        } else {
            if (char === "'" || char === '"') {
                inQuote = true;
                quoteChar = char;
            } else if (char === ',') {
                if (current.trim()) {
                    result.push(current.trim());
                    current = '';
                }
            } else {
                current += char;
            }
        }
    }

    if (current.trim()) {
        result.push(current.trim());
    }

    return result.length > 0 ? result : [str];
}


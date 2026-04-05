import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
    title: 'Frank-Karthic-Dasha Pipeline',
    description: 'Stage-separated legal benchmarking workflow for Frank packets, Karthic rubrics, and Dasha evaluations.',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className="antialiased">
                {children}
            </body>
        </html>
    );
}

import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

app.get('/api/workspace', (req, res) => {
    const targetPath = req.query.path?.toString();
    if (!targetPath) return res.status(400).json({ error: 'path is required' });

    try {
        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) {
            const files = fs.readdirSync(targetPath)
                .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
                .map(file => {
                    const fullPath = path.join(targetPath, file);
                    return {
                        name: file,
                        path: fullPath,
                        content: fs.readFileSync(fullPath, 'utf8')
                    };
                });
            res.json({ type: 'directory', files });
        } else if (stats.isFile() && (targetPath.endsWith('.yaml') || targetPath.endsWith('.yml'))) {
            res.json({
                type: 'file',
                files: [{
                    name: path.basename(targetPath),
                    path: targetPath,
                    content: fs.readFileSync(targetPath, 'utf8')
                }]
            });
        } else {
            res.status(400).json({ error: 'Not a valid directory or YAML file' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/run', (req, res) => {
    const { yamlContent, mcpConfigPath } = req.body;
    if (!yamlContent) {
        return res.status(400).json({ error: 'yamlContent is required' });
    }

    const tempPath = path.join(process.cwd(), `temp_run_${Date.now()}.yaml`);
    fs.writeFileSync(tempPath, yamlContent);

    const env = { ...process.env };
    if (mcpConfigPath && mcpConfigPath.trim() !== '') {
        env.ATAC_MCP_SERVER_CONFIGS = mcpConfigPath.trim();
    }

    console.log(`[ATaC Backend] Running trajectory: ${tempPath}`);

    const child = spawn('atac', ['run', tempPath], { env });

    let output = '';
    child.stdout.on('data', (data) => {
        output += data.toString();
    });
    child.stderr.on('data', (data) => {
        output += data.toString();
    });

    child.on('close', (code) => {
        console.log(`[ATaC Backend] Trajectory finished with code ${code}`);
        try {
            fs.unlinkSync(tempPath);
        } catch (e) { }

        res.json({ output, exitCode: code });
    });

    // Also handle error if 'atac' is not found
    child.on('error', (err) => {
        console.error(`[ATaC Backend] Spawn error:`, err);
        try { fs.unlinkSync(tempPath); } catch (e) { }
        res.status(500).json({ error: 'Failed to start atac process: ' + err.message, output });
    });
});

app.listen(PORT, () => {
    console.log(`[ATaC Backend] Server listening on http://localhost:${PORT}`);
});

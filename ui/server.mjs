import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

app.get('/api/config', (req, res) => {
    const workspaceDir = process.env.ATAC_WORKSPACE_DIR || '';
    let mcpConfigPath = '';

    if (workspaceDir) {
        const configPath = path.join(workspaceDir, '.atac', 'atac.json');
        try {
            if (fs.existsSync(configPath)) {
                const data = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(data);
                if (config.mcp_config) {
                    mcpConfigPath = config.mcp_config;
                }
            }
        } catch (e) {
            console.error('[ATaC Backend] Failed to parse atac.json:', e);
        }
    }

    res.json({
        workspaceDir,
        mcpConfigPath
    });
});

app.get('/api/workspace', (req, res) => {
    const targetPath = req.query.path?.toString();
    if (!targetPath) return res.status(400).json({ error: 'path is required' });

    try {
        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) {
            const files = [];
            const entries = fs.readdirSync(targetPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(targetPath, entry.name);

                if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
                    files.push({
                        name: entry.name,
                        path: fullPath,
                        content: fs.readFileSync(fullPath, 'utf8')
                    });
                } else if (entry.isDirectory()) {
                    // Check if it's an ATaC workspace dir containing index.yaml or index.json
                    const idxYaml = path.join(fullPath, 'index.yaml');
                    const idxYml = path.join(fullPath, 'index.yml');
                    const idxJson = path.join(fullPath, 'index.json');

                    let targetIdx = null;
                    if (fs.existsSync(idxYaml)) targetIdx = idxYaml;
                    else if (fs.existsSync(idxYml)) targetIdx = idxYml;
                    else if (fs.existsSync(idxJson)) targetIdx = idxJson;

                    if (targetIdx) {
                        files.push({
                            name: entry.name, // Display the directory name as the workspace name
                            path: targetIdx,
                            content: fs.readFileSync(targetIdx, 'utf8')
                        });
                    }
                }
            }
            res.json({ type: 'directory', files });
        } else if (stats.isFile() && (targetPath.endsWith('.yaml') || targetPath.endsWith('.yml') || targetPath.endsWith('.json'))) {
            res.json({
                type: 'file',
                files: [{
                    name: path.basename(targetPath),
                    path: targetPath,
                    content: fs.readFileSync(targetPath, 'utf8')
                }]
            });
        } else {
            res.status(400).json({ error: 'Not a valid directory, YAML, or JSON file' });
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

    // We no longer create a temp file. We stream to stdin.
    const env = { ...process.env };
    if (mcpConfigPath) {
        if (Array.isArray(mcpConfigPath)) {
            env.ATAC_MCP_SERVER_CONFIGS = mcpConfigPath.join(',');
        } else if (typeof mcpConfigPath === 'string' && mcpConfigPath.trim() !== '') {
            env.ATAC_MCP_SERVER_CONFIGS = mcpConfigPath.trim();
        }
    }

    console.log(`[ATaC Backend] Running trajectory via stdin`);

    // Spawn 'atac run -' to read from stdin
    const child = spawn('atac', ['run', '-'], { env });

    let output = '';
    child.stdout.on('data', (data) => {
        output += data.toString();
    });
    child.stderr.on('data', (data) => {
        output += data.toString();
    });

    child.on('close', (code) => {
        console.log(`[ATaC Backend] Trajectory finished with code ${code}`);
        res.json({ output, exitCode: code });
    });

    // Handle error if 'atac' is not found or spawn fails
    child.on('error', (err) => {
        console.error(`[ATaC Backend] Spawn error:`, err);
        res.status(500).json({ error: 'Failed to start atac process: ' + err.message });
    });

    // Write YAML content to stdin and close it
    child.stdin.write(yamlContent);
    child.stdin.end();
});

app.listen(PORT, () => {
    console.log(`[ATaC Backend] Server listening on http://localhost:${PORT}`);
});

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

let mainWindow;
let localServer;

const LOCAL_PORT = 18765;
const APP_ROOT = __dirname;

const OFFLINE_DIR = path.join(APP_ROOT, 'offline_maps');
const CACHE_DIR = path.join(OFFLINE_DIR, 'cache');
const MANIFEST_PATH = path.join(OFFLINE_DIR, 'map_cache.json');
const CURRENT_MAP_PATH = path.join(OFFLINE_DIR, 'viagem_atual.pmtiles');
const CURRENT_ROUTE_PATH = path.join(OFFLINE_DIR, 'rota_atual.json');

// Mapa é considerado atual por 30 dias.
// Se a mesma rota voltar antes disso, não baixa novamente.
const MAP_CACHE_MAX_AGE_DAYS = 30;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.pmtiles': 'application/octet-stream',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.pbf': 'application/x-protobuf'
};

function garantirPastas() {
    fs.mkdirSync(OFFLINE_DIR, { recursive: true });
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function carregarManifest() {
    garantirPastas();

    try {
        if (!fs.existsSync(MANIFEST_PATH)) {
            return { versao: 1, mapas: {} };
        }

        const dados = JSON.parse(
            fs.readFileSync(MANIFEST_PATH, 'utf8')
        );

        if (!dados.mapas) dados.mapas = {};
        return dados;

    } catch (erro) {
        console.warn('Manifest de mapas inválido; recriando:', erro);
        return { versao: 1, mapas: {} };
    }
}

function salvarManifest(manifest) {
    garantirPastas();

    const tmp = MANIFEST_PATH + '.tmp';

    fs.writeFileSync(
        tmp,
        JSON.stringify(manifest, null, 2),
        'utf8'
    );

    fs.renameSync(tmp, MANIFEST_PATH);
}

function normalizarNumero(v, casas = 5) {
    const n = Number(v);
    return Number.isFinite(n) ? Number(n.toFixed(casas)) : null;
}

function assinaturaDaRota(dadosRota) {
    const geo = dadosRota?.dados_geojson;
    const coords = geo?.features?.[0]?.geometry?.coordinates || [];

    // Amostra coordenadas para evitar hash gigantesco, sem perder identidade da rota.
    const passo = Math.max(1, Math.floor(coords.length / 300));
    const amostra = [];

    for (let i = 0; i < coords.length; i += passo) {
        const c = coords[i];
        amostra.push([
            normalizarNumero(c?.[0]),
            normalizarNumero(c?.[1])
        ]);
    }

    if (coords.length) {
        const ultimo = coords[coords.length - 1];
        amostra.push([
            normalizarNumero(ultimo?.[0]),
            normalizarNumero(ultimo?.[1])
        ]);
    }

    // Inclui dados que alteram a rota específica.
    const identificacao = {
        id_rota_especifica: dadosRota?.id_rota_especifica || null,
        id_rota: dadosRota?.id || dadosRota?.id_rota || null,
        origem: dadosRota?.origem || '',
        destino: dadosRota?.destino || '',
        altura_total: dadosRota?.altura_total || null,
        peso_total: dadosRota?.peso_total || null,
        restricoes: dadosRota?.restricoes || null,
        geometria: amostra
    };

    return crypto
        .createHash('sha256')
        .update(JSON.stringify(identificacao))
        .digest('hex')
        .slice(0, 24);
}

function diasDesde(iso) {
    if (!iso) return Infinity;

    const t = new Date(iso).getTime();

    if (!Number.isFinite(t)) return Infinity;

    return (Date.now() - t) / 86400000;
}

function copiarAtomico(origem, destino) {
    const tmp = destino + '.tmp';
    fs.copyFileSync(origem, tmp);

    if (fs.existsSync(destino)) {
        fs.unlinkSync(destino);
    }

    fs.renameSync(tmp, destino);
}

function caminhoSeguro(urlPath) {
    const limpo = decodeURIComponent(
        String(urlPath || '/')
            .split('?')[0]
            .replace(/^\/+/, '')
    ) || 'index.html';

    const absoluto = path.resolve(APP_ROOT, limpo);

    if (!absoluto.startsWith(path.resolve(APP_ROOT))) {
        return null;
    }

    return absoluto;
}

function servirArquivoComRange(req, res, arquivo) {
    fs.stat(arquivo, (erro, stat) => {
        if (erro || !stat.isFile()) {
            res.writeHead(404);
            res.end('404');
            return;
        }

        const ext = path.extname(arquivo).toLowerCase();
        const tipo = MIME[ext] || 'application/octet-stream';
        const range = req.headers.range;

        const cabecalhosBase = {
            'Content-Type': tipo,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        };

        if (req.method === 'HEAD') {
            res.writeHead(200, {
                ...cabecalhosBase,
                'Content-Length': stat.size
            });
            res.end();
            return;
        }

        if (range) {
            const match = /bytes=(\d*)-(\d*)/.exec(range);

            if (match) {
                const inicio = match[1] ? Number(match[1]) : 0;
                const fim = match[2]
                    ? Math.min(Number(match[2]), stat.size - 1)
                    : stat.size - 1;

                if (
                    !Number.isFinite(inicio) ||
                    !Number.isFinite(fim) ||
                    inicio > fim ||
                    inicio >= stat.size
                ) {
                    res.writeHead(416, {
                        'Content-Range': `bytes */${stat.size}`
                    });
                    res.end();
                    return;
                }

                res.writeHead(206, {
                    ...cabecalhosBase,
                    'Content-Range': `bytes ${inicio}-${fim}/${stat.size}`,
                    'Content-Length': fim - inicio + 1
                });

                fs.createReadStream(arquivo, {
                    start: inicio,
                    end: fim
                }).pipe(res);

                return;
            }
        }

        res.writeHead(200, {
            ...cabecalhosBase,
            'Content-Length': stat.size
        });

        fs.createReadStream(arquivo).pipe(res);
    });
}

function iniciarServidorLocal() {
    return new Promise((resolve, reject) => {
        localServer = http.createServer((req, res) => {
            const arquivo = caminhoSeguro(req.url);

            if (!arquivo) {
                res.writeHead(403);
                res.end('403');
                return;
            }

            servirArquivoComRange(req, res, arquivo);
        });

        localServer.once('error', reject);

        localServer.listen(LOCAL_PORT, '127.0.0.1', () => {
            console.log(
                `🗺️ Servidor offline local: http://127.0.0.1:${LOCAL_PORT}`
            );
            resolve();
        });
    });
}

function executarPython(args) {
    const candidatos = process.platform === 'win32'
        ? [
            ['python', args],
            ['py', args]
        ]
        : [
            ['python3', args],
            ['python', args]
        ];

    return new Promise((resolve, reject) => {
        let indice = 0;

        function tentar() {
            if (indice >= candidatos.length) {
                reject(new Error(
                    'Python não encontrado para preparar o mapa offline.'
                ));
                return;
            }

            const [cmd, argumentos] = candidatos[indice++];
            const processo = spawn(cmd, argumentos, {
                cwd: APP_ROOT,
                windowsHide: true
            });

            let stdout = '';
            let stderr = '';
            let iniciou = false;

            processo.on('spawn', () => {
                iniciou = true;
            });

            processo.stdout.on('data', d => {
                stdout += d.toString();
                console.log(d.toString().trim());
            });

            processo.stderr.on('data', d => {
                stderr += d.toString();
                console.warn(d.toString().trim());
            });

            processo.on('error', () => {
                if (!iniciou) tentar();
                else reject(new Error(stderr || 'Erro executando Python'));
            });

            processo.on('close', code => {
                if (!iniciou) return;

                if (code === 0) resolve(stdout);
                else reject(new Error(
                    stderr || stdout || `Python terminou com código ${code}`
                ));
            });
        }

        tentar();
    });
}

async function prepararMapaCache(dadosRota) {
    garantirPastas();

    const geojson = dadosRota?.dados_geojson;

    if (!geojson?.features?.[0]?.geometry?.coordinates?.length) {
        throw new Error('Rota sem geometria válida.');
    }

    const cacheKey = assinaturaDaRota(dadosRota);
    const cachePath = path.join(
        CACHE_DIR,
        `${cacheKey}.pmtiles`
    );

    const manifest = carregarManifest();
    const anterior = manifest.mapas[cacheKey] || null;

    const cacheExiste =
        fs.existsSync(cachePath) &&
        fs.statSync(cachePath).size > 1000;

    const cacheAtual =
        cacheExiste &&
        anterior &&
        diasDesde(anterior.atualizado_em) <= MAP_CACHE_MAX_AGE_DAYS;

    // Sempre atualiza os dados da viagem/rota atual,
    // mesmo quando o mapa é reaproveitado.
    fs.writeFileSync(
        CURRENT_ROUTE_PATH,
        JSON.stringify(geojson, null, 2),
        'utf8'
    );

    if (cacheAtual) {
        copiarAtomico(cachePath, CURRENT_MAP_PATH);

        anterior.ultimo_uso = new Date().toISOString();
        anterior.usos = Number(anterior.usos || 0) + 1;

        manifest.mapas[cacheKey] = anterior;
        salvarManifest(manifest);

        return {
            ok: true,
            cache_key: cacheKey,
            reutilizado: true,
            atualizado: false,
            idade_dias: Number(
                diasDesde(anterior.atualizado_em).toFixed(1)
            ),
            tamanho_mb: (
                fs.statSync(cachePath).size / 1024 / 1024
            ).toFixed(1)
        };
    }

    // Se existe mas venceu, mantém o arquivo atual em uso
    // enquanto baixa a atualização para um .tmp.
    if (cacheExiste && !fs.existsSync(CURRENT_MAP_PATH)) {
        copiarAtomico(cachePath, CURRENT_MAP_PATH);
    }

    const script = path.join(
        APP_ROOT,
        'preparar_mapa_offline.py'
    );

    const tmpCachePath = path.join(
        CACHE_DIR,
        `${cacheKey}.novo.pmtiles`
    );

    try {
        if (fs.existsSync(tmpCachePath)) {
            fs.unlinkSync(tmpCachePath);
        }

        await executarPython([
            script,
            '--rota', CURRENT_ROUTE_PATH,
            '--saida', tmpCachePath,
            '--buffer-km', '12',
            '--maxzoom', '14'
        ]);

        if (
            !fs.existsSync(tmpCachePath) ||
            fs.statSync(tmpCachePath).size < 1000
        ) {
            throw new Error('Mapa atualizado não foi criado corretamente.');
        }

        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
        }

        fs.renameSync(tmpCachePath, cachePath);
        copiarAtomico(cachePath, CURRENT_MAP_PATH);

        const agora = new Date().toISOString();

        manifest.mapas[cacheKey] = {
            cache_key: cacheKey,
            arquivo: path.basename(cachePath),
            criado_em: anterior?.criado_em || agora,
            atualizado_em: agora,
            ultimo_uso: agora,
            usos: Number(anterior?.usos || 0) + 1,
            validade_dias: MAP_CACHE_MAX_AGE_DAYS,
            rota_nome: dadosRota?.nome || '',
            origem: dadosRota?.origem || '',
            destino: dadosRota?.destino || '',
            id_rota_especifica:
                dadosRota?.id_rota_especifica || null,
            tamanho_bytes: fs.statSync(cachePath).size
        };

        salvarManifest(manifest);

        return {
            ok: true,
            cache_key: cacheKey,
            reutilizado: cacheExiste,
            atualizado: true,
            idade_dias: 0,
            tamanho_mb: (
                fs.statSync(cachePath).size / 1024 / 1024
            ).toFixed(1)
        };

    } catch (erro) {
        try {
            if (fs.existsSync(tmpCachePath)) {
                fs.unlinkSync(tmpCachePath);
            }
        } catch (_) {}

        // Se havia cache antigo, continua usando em fallback.
        if (cacheExiste) {
            copiarAtomico(cachePath, CURRENT_MAP_PATH);

            return {
                ok: true,
                cache_key: cacheKey,
                reutilizado: true,
                atualizado: false,
                desatualizado: true,
                aviso:
                    'Não foi possível atualizar agora; usando mapa anterior.',
                tamanho_mb: (
                    fs.statSync(cachePath).size / 1024 / 1024
                ).toFixed(1)
            };
        }

        throw erro;
    }
}

ipcMain.handle('preparar-mapa-offline', async (_event, dadosRota) => {
    try {
        return await prepararMapaCache(dadosRota);

    } catch (erro) {
        console.error('❌ Preparar mapa offline:', erro);

        return {
            ok: false,
            erro: erro.message
        };
    }
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        },
        icon: path.join(__dirname, 'caminhao-icon.png'),
        title: 'GPS Caminhão'
    });

    mainWindow.loadURL(
        `http://127.0.0.1:${LOCAL_PORT}/index.html`
    );

    const menu = Menu.buildFromTemplate([
        {
            label: 'Arquivo',
            submenu: [
                {
                    label: 'Sair',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Exibir',
            submenu: [
                { label: 'Recarregar', role: 'reload' },
                { label: 'Ferramentas', role: 'toggleDevTools' },
                { label: 'Tela Cheia', role: 'togglefullscreen' }
            ]
        }
    ]);

    Menu.setApplicationMenu(menu);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    garantirPastas();
    await iniciarServidorLocal();
    createWindow();
});

app.on('window-all-closed', () => {
    if (localServer) {
        try { localServer.close(); } catch (_) {}
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

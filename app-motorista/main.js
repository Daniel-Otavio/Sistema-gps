const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'caminhao-icon.png'),
        title: 'GPS Caminhão'
    });

    // Carregar o arquivo HTML
    mainWindow.loadFile('index.html');

    // Abrir DevTools (útil para debug - comente depois)
    // mainWindow.webContents.openDevTools();

    // Criar menu personalizado
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
import * as path from 'path';
import * as vscode from 'vscode';
import { ColorThemeKind } from 'vscode';
import {
    PetSize,
    PetColor,
    PetType,
    ExtPosition,
    Theme,
    WebviewMessage,
} from '../common/types';

const EXTRA_PETS_KEY = 'vscode-pets.extra-pets';
const EXTRA_PETS_KEY_TYPES = EXTRA_PETS_KEY + '.types';
const EXTRA_PETS_KEY_COLORS = EXTRA_PETS_KEY + '.colors';
const DEFAULT_PET_SCALE = PetSize.nano;
const DEFAULT_COLOR = PetColor.brown;
const DEFAULT_PET_TYPE = PetType.cat;
const DEFAULT_POSITION = ExtPosition.panel;
const DEFAULT_THEME = Theme.none;

const ALL_PETS = [
    PetType.cat,
    PetType.clippy,
    PetType.crab,
    PetType.dog,
    PetType.rocky,
    PetType.rubberduck,
    PetType.snake,
    PetType.totoro,
    PetType.zappy,
];
const ALL_COLORS = [
    PetColor.black,
    PetColor.brown,
    PetColor.green,
    PetColor.yellow,
    PetColor.gray,
    PetColor.red,
    PetColor.null,
];
const ALL_SCALES = [PetSize.nano, PetSize.medium, PetSize.large];
const ALL_THEMES = [Theme.none, Theme.forest, Theme.castle];

let webviewViewProvider: PetWebviewViewProvider;

function getConfiguredSize(): PetSize {
    var size = vscode.workspace
        .getConfiguration('vscode-pets')
        .get<PetSize>('petSize', DEFAULT_PET_SCALE);
    if (ALL_SCALES.lastIndexOf(size) === -1) {
        size = DEFAULT_PET_SCALE;
    }
    return size;
}

function getConfiguredTheme(): Theme {
    var theme = vscode.workspace
        .getConfiguration('vscode-pets')
        .get<Theme>('theme', DEFAULT_THEME);
    if (ALL_THEMES.lastIndexOf(theme) === -1) {
        theme = DEFAULT_THEME;
    }
    return theme;
}

function getConfiguredThemeKind(): ColorThemeKind {
    return vscode.window.activeColorTheme.kind;
}

function getConfigurationPosition() {
    return vscode.workspace
        .getConfiguration('vscode-pets')
        .get<ExtPosition>('position', DEFAULT_POSITION);
}

function updateExtensionPositionContext() {
    vscode.commands.executeCommand(
        'setContext',
        'vscode-pets.position',
        getConfigurationPosition(),
    );
}

export class PetSpecification {
    color: PetColor;
    type: PetType;
    size: PetSize;

    constructor(color: PetColor, type: PetType, size: PetSize) {
        this.color = color;
        this.type = type;
        this.size = size;
    }

    static fromConfiguration(): PetSpecification {
        var color = vscode.workspace
            .getConfiguration('vscode-pets')
            .get<PetColor>('petColor', DEFAULT_COLOR);
        if (ALL_COLORS.lastIndexOf(color) === -1) {
            color = DEFAULT_COLOR;
        }
        var type = vscode.workspace
            .getConfiguration('vscode-pets')
            .get<PetType>('petType', DEFAULT_PET_TYPE);
        if (ALL_PETS.lastIndexOf(type) === -1) {
            type = DEFAULT_PET_TYPE;
        }

        return new PetSpecification(color, type, getConfiguredSize());
    }

    static collectionFromMemento(
        context: vscode.ExtensionContext,
        size: PetSize,
    ): PetSpecification[] {
        var contextTypes = context.globalState.get<PetType[]>(
            EXTRA_PETS_KEY_TYPES,
            [],
        );
        var contextColors = context.globalState.get<PetColor[]>(
            EXTRA_PETS_KEY_COLORS,
            [],
        );
        var result: PetSpecification[] = new Array();
        for (let index = 0; index < contextTypes.length; index++) {
            result.push(
                new PetSpecification(
                    contextColors![index],
                    contextTypes[index],
                    size,
                ),
            );
        }
        return result;
    }
}

export function storeCollectionAsMemento(
    context: vscode.ExtensionContext,
    collection: PetSpecification[],
) {
    var contextTypes = new Array(collection.length);
    var contextColors = new Array(collection.length);
    for (let index = 0; index < collection.length; index++) {
        contextTypes[index] = collection[index].type;
        contextColors[index] = collection[index].color;
    }
    context.globalState.update(EXTRA_PETS_KEY_TYPES, contextTypes);
    context.globalState.update(EXTRA_PETS_KEY_COLORS, contextColors);
    context.globalState.setKeysForSync([
        EXTRA_PETS_KEY_TYPES,
        EXTRA_PETS_KEY_COLORS,
    ]);
}

let petPlaygroundStatusBar: vscode.StatusBarItem;
let spawnPetStatusBar: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.start', () => {
            if (
                getConfigurationPosition() === ExtPosition.explorer &&
                webviewViewProvider
            ) {
                vscode.commands.executeCommand('vscode-pets.petsView.focus');
            } else {
                const spec = PetSpecification.fromConfiguration();
                PetPanel.createOrShow(
                    context.extensionUri,
                    context.extensionPath,
                    spec.color,
                    spec.type,
                    spec.size,
                    getConfiguredTheme(),
                    getConfiguredThemeKind(),
                );

                if (PetPanel.currentPanel) {
                    var collection = PetSpecification.collectionFromMemento(
                        context,
                        getConfiguredSize(),
                    );
                    collection.forEach((item) => {
                        PetPanel.currentPanel!.spawnPet(item);
                    });
                }
            }
        }),
    );

    // status bar item
    petPlaygroundStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100,
    );
    petPlaygroundStatusBar.command = 'vscode-pets.start';
    context.subscriptions.push(petPlaygroundStatusBar);

    spawnPetStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100,
    );
    spawnPetStatusBar.command = 'vscode-pets.spawn-pet';
    context.subscriptions.push(spawnPetStatusBar);

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateStatusBar),
    );
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(updateStatusBar),
    );
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(
            updateExtensionPositionContext,
        ),
    );
    updateStatusBar();

    const spec = PetSpecification.fromConfiguration();
    webviewViewProvider = new PetWebviewViewProvider(
        context.extensionUri,
        context.extensionPath,
        spec.color,
        spec.type,
        spec.size,
        getConfiguredTheme(),
        getConfiguredThemeKind(),
    );
    updateExtensionPositionContext();

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            PetWebviewViewProvider.viewType,
            webviewViewProvider,
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.throw-ball', () => {
            if (
                getConfigurationPosition() === ExtPosition.explorer &&
                webviewViewProvider
            ) {
                webviewViewProvider.throwBall();
            } else if (PetPanel.currentPanel) {
                PetPanel.currentPanel.throwBall();
            } else {
                vscode.window.showErrorMessage(
                    "Please open a Pet's Playground first.",
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.delete-pets', () => {
            if (
                getConfigurationPosition() === ExtPosition.explorer &&
                webviewViewProvider
            ) {
                webviewViewProvider.deletePet();
            } else if (PetPanel.currentPanel) {
                PetPanel.currentPanel.deletePet();
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.spawn-pet', async () => {
            if (
                PetPanel.currentPanel ||
                getConfigurationPosition() === ExtPosition.explorer
            ) {
                const petType = await vscode.window.showQuickPick(ALL_PETS, {
                    placeHolder: 'Select a pet',
                });
                var petColor: PetColor = DEFAULT_COLOR;
                var choices;
                switch (petType as PetType) {
                    case PetType.rubberduck:
                        petColor = PetColor.yellow;
                        break;
                    case PetType.snake:
                        petColor = PetColor.green;
                        break;
                    case PetType.rocky:
                    case PetType.totoro:
                        petColor = PetColor.gray;
                        break;
                    case PetType.cat:
                        choices = [PetColor.black, PetColor.brown, PetColor.red];
                        petColor = (await vscode.window.showQuickPick(choices, {
                            placeHolder: 'Select a color',
                        })) as PetColor;
                        break;
                    case PetType.dog:
                        choices = [PetColor.black, PetColor.brown];
                        petColor = (await vscode.window.showQuickPick(choices, {
                            placeHolder: 'Select a color',
                        })) as PetColor;
                        break;
                    case PetType.clippy:
                        choices = [
                            PetColor.black,
                            PetColor.brown,
                            PetColor.green,
                            PetColor.yellow,
                        ];
                        petColor = (await vscode.window.showQuickPick(choices, {
                            placeHolder: 'Select a color',
                        })) as PetColor;
                        break;
                    case PetType.crab:
                        petColor = PetColor.red;
                        break;
                    case PetType.zappy:
                        petColor = PetColor.yellow;
                        break;
                }
                const spec = new PetSpecification(
                    petColor,
                    petType as PetType,
                    getConfiguredSize(),
                );
                if (
                    spec.type == null ||
                    spec.color == null ||
                    spec.size == null
                ) {
                    return vscode.window.showErrorMessage(
                        'Cancelled Spawning Pet',
                    );
                } else if (
                    getConfigurationPosition() === ExtPosition.explorer &&
                    spec
                ) {
                    webviewViewProvider.spawnPet(spec);
                } else if (PetPanel.currentPanel && spec) {
                    PetPanel.currentPanel.spawnPet(spec);
                }
                var collection = PetSpecification.collectionFromMemento(
                    context,
                    getConfiguredSize(),
                );
                collection.push(spec);
                storeCollectionAsMemento(context, collection);
            } else {
                const spec = PetSpecification.fromConfiguration();
                PetPanel.createOrShow(
                    context.extensionUri,
                    context.extensionPath,
                    spec.color,
                    spec.type,
                    spec.size,
                    getConfiguredTheme(),
                    getConfiguredThemeKind(),
                );
                if (PetPanel.currentPanel) {
                    var collection = PetSpecification.collectionFromMemento(
                        context,
                        getConfiguredSize(),
                    );
                    collection.forEach((item) => {
                        PetPanel.currentPanel!.spawnPet(item);
                    });
                } else {
                    var collection = PetSpecification.collectionFromMemento(
                        context,
                        getConfiguredSize(),
                    );
                    collection.push(spec);
                    storeCollectionAsMemento(context, collection);
                }
                vscode.window.showInformationMessage(
                    "A Pet Playground has been created. You can now use the 'Spawn Additional Pet' Command to add more pets.",
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-pets.reset-pets', () => {
            if (
                getConfigurationPosition() === ExtPosition.explorer &&
                webviewViewProvider
            ) {
                webviewViewProvider.resetPets();
                var collection = PetSpecification.collectionFromMemento(
                    context,
                    getConfiguredSize(),
                );
                collection.splice(0, collection.length);
                storeCollectionAsMemento(context, collection);
            } else if (PetPanel.currentPanel) {
                PetPanel.currentPanel.resetPets();
                var collection = PetSpecification.collectionFromMemento(
                    context,
                    getConfiguredSize(),
                );
                collection.splice(0, collection.length);
                storeCollectionAsMemento(context, collection);
            } else {
                vscode.window.showErrorMessage(
                    'Please Open a Pet Playground to Reset the Pets!',
                );
            }
        }),
    );

    // Listening to configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(
            (e: vscode.ConfigurationChangeEvent): void => {
                if (
                    e.affectsConfiguration('vscode-pets.petColor') ||
                    e.affectsConfiguration('vscode-pets.petType') ||
                    e.affectsConfiguration('vscode-pets.petSize') ||
                    e.affectsConfiguration('vscode-pets.theme') ||
                    e.affectsConfiguration('workbench.colorTheme')
                ) {
                    const spec = PetSpecification.fromConfiguration();
                    if (PetPanel.currentPanel) {
                        PetPanel.currentPanel.updatePetColor(spec.color);
                        PetPanel.currentPanel.updatePetSize(spec.size);
                        PetPanel.currentPanel.updatePetType(spec.type);
                        PetPanel.currentPanel.updateTheme(
                            getConfiguredTheme(),
                            getConfiguredThemeKind(),
                        );
                        PetPanel.currentPanel.update();
                    }

                    if (
                        getConfigurationPosition() === ExtPosition.explorer &&
                        webviewViewProvider
                    ) {
                        webviewViewProvider.updatePetColor(spec.color);
                        webviewViewProvider.updatePetSize(spec.size);
                        webviewViewProvider.updatePetType(spec.type);
                        webviewViewProvider.updateTheme(
                            getConfiguredTheme(),
                            getConfiguredThemeKind(),
                        );
                        webviewViewProvider.update();
                    }
                }

                if (e.affectsConfiguration('vscode-pets.position')) {
                    updateExtensionPositionContext();
                }
            },
        ),
    );

    if (vscode.window.registerWebviewPanelSerializer) {
        // Make sure we register a serializer in activation event
        vscode.window.registerWebviewPanelSerializer(PetPanel.viewType, {
            async deserializeWebviewPanel(
                webviewPanel: vscode.WebviewPanel,
                state: any,
            ) {
                // Reset the webview options so we use latest uri for `localResourceRoots`.
                webviewPanel.webview.options = getWebviewOptions(
                    context.extensionUri,
                );
                const spec = PetSpecification.fromConfiguration();
                PetPanel.revive(
                    webviewPanel,
                    context.extensionUri,
                    context.extensionPath,
                    spec.color,
                    spec.type,
                    spec.size,
                    getConfiguredTheme(),
                    getConfiguredThemeKind(),
                );
            },
        });
    }
}

function updateStatusBar(): void {
    spawnPetStatusBar.text = `$(squirrel)`;
    spawnPetStatusBar.tooltip = 'Spawn Pet';
    spawnPetStatusBar.show();
}

export function petPlaygroundDeactivate() {
    petPlaygroundStatusBar.dispose();
}

export function spawnPetDeactivate() {
    spawnPetStatusBar.dispose();
}

function getWebviewOptions(
    extensionUri: vscode.Uri,
): vscode.WebviewOptions & vscode.WebviewPanelOptions {
    return {
        // Enable javascript in the webview
        enableScripts: true,
        // And restrict the webview to only loading content from our extension's `media` directory.
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    };
}

/**
 * Some pets can only have certain colors, this makes sure they haven't been misconfigured.
 * @param petColor
 * @param petType
 * @returns normalized color
 */
function normalizeColor(petColor: PetColor, petType: PetType): PetColor {
    if (petType === PetType.totoro || petType === PetType.rocky) {
        return PetColor.gray;
    }
    if (petType === PetType.snake) {
        return PetColor.green;
    }
    if (petType === PetType.rubberduck || petType === PetType.zappy) {
        return PetColor.yellow;
    }
    if (petType === PetType.crab) {
        return PetColor.red;
    }
    if (petType === PetType.dog &&
        petColor !== PetColor.brown &&
        petColor !== PetColor.black
    ) {
        return PetColor.brown;
    }
    if (petType === PetType.cat &&
        petColor !== PetColor.brown &&
        petColor !== PetColor.black &&
        petColor !== PetColor.red
    ) {
        return PetColor.brown;
    }
    return petColor;
}

class PetWebviewContainer {
    protected _extensionUri: vscode.Uri;
    protected _disposables: vscode.Disposable[] = [];
    protected _petMediaPath: string;
    protected _petColor: PetColor;
    protected _petType: PetType;
    protected _petSize: PetSize;
    protected _theme: Theme;
    protected _themeKind: vscode.ColorThemeKind;

    constructor(
        extensionUri: vscode.Uri,
        extensionPath: string,
        color: PetColor,
        type: PetType,
        size: PetSize,
        theme: Theme,
        themeKind: ColorThemeKind,
    ) {
        this._extensionUri = extensionUri;
        this._petMediaPath = path.join(extensionPath, 'media');
        this._petColor = color;
        this._petType = type;
        this._petSize = size;
        this._theme = theme;
        this._themeKind = themeKind;
    }

    public petColor(): PetColor {
        return normalizeColor(this._petColor, this._petType);
    }

    public petType(): PetType {
        return this._petType;
    }

    public petSize(): PetSize {
        return this._petSize;
    }

    public theme(): Theme {
        return this._theme;
    }

    public themeKind(): vscode.ColorThemeKind {
        return this._themeKind;
    }

    public updatePetColor(newColor: PetColor) {
        this._petColor = newColor;
    }

    public updatePetType(newType: PetType) {
        this._petType = newType;
    }

    public updatePetSize(newSize: PetSize) {
        this._petSize = newSize;
    }

    public updateTheme(newTheme: Theme, themeKind: vscode.ColorThemeKind) {
        this._theme = newTheme;
        this._themeKind = themeKind;
    }

    public throwBall() {
        this.getWebview().postMessage({
            command: 'throw-ball',
        });
    }

    public spawnPet(spec: PetSpecification) {
        this.getWebview().postMessage({
            command: 'spawn-pet',
            type: spec.type,
            color: spec.color,
        });
        this.getWebview().postMessage({ command: 'set-size', size: spec.size });
    }

    public deletePet() {
        this.getWebview().postMessage({ command: 'delete-pet' });
    }

    protected getWebview(): vscode.Webview {
        throw new Error('Not implemented');
    }

    protected _update() {
        const webview = this.getWebview();
        webview.html = this._getHtmlForWebview(webview);
    }

    public update() {
        throw new Error('Not implemented');
    }

    protected _getHtmlForWebview(webview: vscode.Webview) {
        // Local path to main script run in the webview
        const scriptPathOnDisk = vscode.Uri.joinPath(
            this._extensionUri,
            'media',
            'main-bundle.js',
        );

        // And the uri we use to load this script in the webview
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        // Local path to css styles
        const styleResetPath = vscode.Uri.joinPath(
            this._extensionUri,
            'media',
            'reset.css',
        );
        const stylesPathMainPath = vscode.Uri.joinPath(
            this._extensionUri,
            'media',
            'pets.css',
        );

        // Uri to load styles into webview
        const stylesResetUri = webview.asWebviewUri(styleResetPath);
        const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

        // Get path to resource on disk
        const basePetUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this._petMediaPath)),
        );

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
                    webview.cspSource
                }; img-src ${
            webview.cspSource
        } https:; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${stylesResetUri}" rel="stylesheet">
				<link href="${stylesMainUri}" rel="stylesheet">
				<title>VS Code Pets</title>
			</head>
			<body>
				<canvas id="petCanvas"></canvas>
				<div id="petsContainer"></div>
				<div id="foreground"></div>	
				<script nonce="${nonce}" src="${scriptUri}"></script>
				<script nonce="${nonce}">petApp.petPanelApp("${basePetUri}", "${this.theme()}", ${this.themeKind()}, "${this.petColor()}", "${this.petSize()}", "${this.petType()}");</script>
			</body>
			</html>`;
    }
}

function handleWebviewMessage(message: WebviewMessage) {
    switch (message.command) {
        case 'alert':
            vscode.window.showErrorMessage(message.text);
            return;
        case 'info':
            vscode.window.showInformationMessage(message.text);
            return;
    }
}

/**
 * Manages pet coding webview panels
 */
class PetPanel extends PetWebviewContainer {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: PetPanel | undefined;

    public static readonly viewType = 'petCoding';

    private readonly _panel: vscode.WebviewPanel;

    public static createOrShow(
        extensionUri: vscode.Uri,
        extensionPath: string,
        petColor: PetColor,
        petType: PetType,
        petSize: PetSize,
        theme: Theme,
        themeKind: ColorThemeKind,
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        // If we already have a panel, show it.
        if (PetPanel.currentPanel) {
            if (
                petColor === PetPanel.currentPanel.petColor() &&
                petType === PetPanel.currentPanel.petType() &&
                petSize === PetPanel.currentPanel.petSize()
            ) {
                PetPanel.currentPanel._panel.reveal(column);
                return;
            } else {
                PetPanel.currentPanel.updatePetColor(petColor);
                PetPanel.currentPanel.updatePetType(petType);
                PetPanel.currentPanel.updatePetSize(petSize);
                PetPanel.currentPanel.update();
            }
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            PetPanel.viewType,
            'Pet Panel',
            vscode.ViewColumn.Two,
            getWebviewOptions(extensionUri),
        );

        PetPanel.currentPanel = new PetPanel(
            panel,
            extensionUri,
            extensionPath,
            petColor,
            petType,
            petSize,
            theme,
            themeKind,
        );
    }

    public resetPets() {
        this.getWebview().postMessage({ command: 'reset-pet' });
    }

    public deletePet(): void {
        this.getWebview().postMessage({ command: 'delete-pet' });
    }

    public static revive(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        extensionPath: string,
        petColor: PetColor,
        petType: PetType,
        petSize: PetSize,
        theme: Theme,
        themeKind: ColorThemeKind,
    ) {
        PetPanel.currentPanel = new PetPanel(
            panel,
            extensionUri,
            extensionPath,
            petColor,
            petType,
            petSize,
            theme,
            themeKind,
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        extensionPath: string,
        color: PetColor,
        type: PetType,
        size: PetSize,
        theme: Theme,
        themeKind: ColorThemeKind,
    ) {
        super(extensionUri, extensionPath, color, type, size, theme, themeKind);

        this._panel = panel;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            (e) => {
                this.update();
            },
            null,
            this._disposables,
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            handleWebviewMessage,
            null,
            this._disposables,
        );
    }

    public dispose() {
        PetPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    public update() {
        if (this._panel.visible) {
            this._update();
        }
    }

    getWebview(): vscode.Webview {
        return this._panel.webview;
    }
}

class PetWebviewViewProvider extends PetWebviewContainer {
    public static readonly viewType = 'vscode-pets.petsView';

    private _webviewView?: vscode.WebviewView;

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken,
    ): void | Thenable<void> {
        this._webviewView = webviewView;

        webviewView.webview.options = getWebviewOptions(this._extensionUri);
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            handleWebviewMessage,
            null,
            this._disposables,
        );
    }

    update() {
        this._update();
    }

    public resetPets() {
        this.getWebview().postMessage({
            command: 'reset-pet',
            type: this.petType(),
            color: this.petColor(),
            size: this.petSize(),
        });
    }

    getWebview(): vscode.Webview {
        return this._webviewView!.webview;
    }
}

function getNonce() {
    let text = '';
    const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

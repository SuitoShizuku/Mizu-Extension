const path = require('path');
const AdmZip = require('adm-zip');
const fs = require('fs');
const picomatch = require('picomatch');

// ADD: manifest.jsonからバージョン情報を取得
const rawJson = fs.readFileSync('manifest.json', 'utf-8');
const buffer = rawJson.toString();
const manifest = JSON.parse(buffer);
const extensionVersion = manifest.version;

const zip = new AdmZip();

const ignores = [
    '*.zip',
    '.git',
    '.gitignore',
    'assets/icon/4k.svg',
    'dev',
    'node_modules',
    'package-lock.json',
    'package.json',
    'packed.js',
    'README.md',
    'ShizukuExtension/iariri/iachara_load.js',
    'ShizukuExtension/mizuEQ/._POPUP_TEMPLATE.md',
    'ShizukuExtension/mizuEQ/manifest.json',
    'ShizukuExtension/shurasuke',
    'ShizukuExtension/youtubeBackur/old_content.js'
];

// ADD: globパターン判定関数を作成
const isIgnoredGlob = picomatch(ignores, { nocase: true });
const targetDir = __dirname;

// ADD: ディレクトリを追加(ignores配列に基づいて除外)
zip.addLocalFolder(targetDir, '', (filePath) => {
    // EDIT: ルートからの相対パスを取得し、/ に統一
    const rel = path.relative(targetDir, filePath).replace(/\\/g, '/');

    // EDIT: ルートフォルダ自体はスキップ
    if (!rel) return false;

    // EDIT: 完全一致またはglobパターン(*.zip等)に一致する場合は除外
    if (isIgnoredGlob(rel)) return false;

    // EDIT: 指定されたフォルダ(devやnode_modules等)の配下もまとめて除外
    const isSubItem = ignores.some(ig => rel.startsWith(ig + '/'));
    if (isSubItem) return false;

    return true;
});

// ADD: ZIPファイルを書き出し
zip.writeZip(`Mizu-Extension-v${extensionVersion}.zip`);
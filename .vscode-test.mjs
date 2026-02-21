import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@vscode/test-cli';

const preferredVersion = '1.105.1';
const userProfile = process.env.USERPROFILE
	|| (process.env.HOMEDRIVE && process.env.HOMEPATH
		? path.join(process.env.HOMEDRIVE, process.env.HOMEPATH)
		: undefined);

const preferredExecutable = userProfile
	? path.join(
		userProfile,
		'sauce',
		'testbench',
		'.vscode-test',
		`vscode-win32-x64-archive-${preferredVersion}`,
		'Code.exe'
	)
	: undefined;

const config = {
	files: 'test/**/*.test.js',
	desktopPlatform: 'win32-x64-archive',
	version: process.env.VSCODE_VERSION || preferredVersion,
	env: {
		...process.env,
		ELECTRON_RUN_AS_NODE: undefined,
		BLINTER_TEST_MODE: process.env.BLINTER_TEST_MODE || '1'
	}
};

if (preferredExecutable && fs.existsSync(preferredExecutable)) {
	config.useInstallation = {
		fromPath: preferredExecutable
	};
}

export default defineConfig(config);

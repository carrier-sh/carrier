// Re-export all command functions
export { auth } from './auth.js';
export { whoami } from './whoami.js';
export { logout } from './logout.js';
export { deploy } from './deploy.js';
export { execute } from './execute.js';
export { executeTask } from './execute-task.js';
export { approve } from './approve.js';
export { status } from './status.js';
export { ls } from './ls.js';
export { pull } from './pull.js';
export { push } from './push.js';
export { rm } from './rm.js';
// export { init } from './init.js'; // Init is handled directly in CLICommands class
export { config } from './config.js';
export { help } from './help.js';
export { uninstall } from './uninstall.js';
export { saveOutput } from './save-output.js';
export { updateTask } from './update-task.js';
export { updateFleet } from './update-fleet.js';
export { getOutput } from './get-output.js';
export { fleet } from './fleet.js';
export { getContext } from './get-context.js';
export { taskStatus } from './task-status.js';
export { clean } from './clean.js';
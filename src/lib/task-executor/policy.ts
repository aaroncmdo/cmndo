// Global-Kill-Switch fuer den KI-Task-Executor. Safe-by-default (aus).
export function isExecutorEnabled(): boolean {
  return process.env.TASK_EXECUTOR_ENABLED === 'true'
}

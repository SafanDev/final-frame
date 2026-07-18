export const logger = {
  info: (msg: string, meta: any = {}) => 
    console.log(JSON.stringify({ level: 'info', msg, timestamp: new Date().toISOString(), ...meta })),
  warn: (msg: string, meta: any = {}) => 
    console.warn(JSON.stringify({ level: 'warn', msg, timestamp: new Date().toISOString(), ...meta })),
  error: (msg: string, meta: any = {}) => 
    console.error(JSON.stringify({ level: 'error', msg, timestamp: new Date().toISOString(), ...meta })),
};
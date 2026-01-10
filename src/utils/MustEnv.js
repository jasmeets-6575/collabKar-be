export function mustEnv(key) {
    const val = process.env[key];
    if (!val) {
        throw new Error(`Missing env: ${key}`);
    }
    return val;
}

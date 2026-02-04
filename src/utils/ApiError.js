class ApiError extends Error {
    constructor(statusCode, message = "Something went wrong", errors = [], stack = "") {
        super(message);
        this.statusCode = statusCode;
        this.data = null;
        this.message = message;
        this.success = false;
        this.error = errors;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    static handleError(res) {
        return (err) => {
            const statusCode = err.statusCode || 500;
            const message = err.message || 'Internal Server Error';
            return res.status(statusCode).json({
                data: null,
                error: message,
                success: false
            });
        };
    }
}

export { ApiError };

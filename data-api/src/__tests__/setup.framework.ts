// Suppress console.error noise from expected error-handling paths (e.g., 409, 401 thrown errors)
jest.spyOn(console, "error").mockImplementation(() => undefined);

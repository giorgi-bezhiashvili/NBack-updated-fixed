declare global {
  namespace Express {
    interface User {
      userName: string;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};

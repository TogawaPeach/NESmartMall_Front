export interface LoginCredentials {
  account: string
  password: string
}

export interface AuthUser {
  id: string
  account: string
  nickname: string
  role: number
}

export interface LoginData {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
  user: AuthUser
}

export interface AuthSession {
  accessToken: string
  tokenType: 'Bearer'
  expiresAt: number
  user: AuthUser
}

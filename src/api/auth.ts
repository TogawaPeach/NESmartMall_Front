import axios from 'axios'
import { http } from './http'
import type { AuthUser, LoginCredentials, LoginData, RegisterCredentials } from '@/types/auth'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAuthUser(value: unknown): value is AuthUser {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    !!value.id.trim() &&
    typeof value.account === 'string' &&
    !!value.account.trim() &&
    typeof value.nickname === 'string' &&
    typeof value.role === 'number' &&
    Number.isSafeInteger(value.role)
  )
}

function businessMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.message === 'string' && value.message.trim()
    ? value.message
    : fallback
}

function parseAuthData(data: unknown, action: '登录' | '注册'): LoginData {
  if (
    !isRecord(data) ||
    typeof data.accessToken !== 'string' ||
    !data.accessToken.trim() ||
    /\s/.test(data.accessToken) ||
    data.tokenType !== 'Bearer' ||
    typeof data.expiresIn !== 'number' ||
    !Number.isFinite(data.expiresIn) ||
    data.expiresIn <= 0 ||
    !Number.isSafeInteger(Date.now() + data.expiresIn * 1000) ||
    !isAuthUser(data.user)
  ) {
    throw new Error(`${action}响应格式异常，请稍后重试`)
  }
  return {
    accessToken: data.accessToken,
    tokenType: 'Bearer',
    expiresIn: data.expiresIn,
    user: {
      id: data.user.id,
      account: data.user.account,
      nickname: data.user.nickname,
      role: data.user.role,
    },
  }
}

export async function register(
  credentials: RegisterCredentials,
  options: { signal?: AbortSignal } = {},
): Promise<LoginData> {
  const account = credentials.account.trim()
  const nickname = credentials.nickname.trim()
  if (!/^1[3-9]\d{9}$/.test(account)) throw new Error('请输入有效的11位手机号')
  if (!nickname || nickname.length > 64) throw new Error('昵称须为1至64个字符')
  if (!credentials.password.trim()) throw new Error('请输入密码')
  if (credentials.role !== 0 && credentials.role !== 1) throw new Error('请选择用户或商家')

  let payload: unknown
  try {
    const response = await http.post<unknown>(
      '/api/auth/register',
      { account, nickname, password: credentials.password, role: credentials.role },
      { signal: options.signal },
    )
    payload = response.data
  } catch (error) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(businessMessage(error.response.data, '注册失败，请稍后重试'))
      }
      throw new Error(
        error.code === 'ECONNABORTED' ? '注册请求超时，请重试' : '无法连接服务器，请稍后重试',
      )
    }
    throw error
  }
  if (!isRecord(payload) || payload.code !== 200) {
    throw new Error(businessMessage(payload, '注册失败，请稍后重试'))
  }
  return parseAuthData(payload.data, '注册')
}

export async function login(
  credentials: LoginCredentials,
  options: { signal?: AbortSignal } = {},
): Promise<LoginData> {
  const account = credentials.account.trim()
  if (!account || !credentials.password) throw new Error('请输入账号和密码')

  let payload: unknown
  try {
    const response = await http.post<unknown>(
      '/api/auth/login',
      { account, password: credentials.password },
      { signal: options.signal },
    )
    payload = response.data
  } catch (error) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(businessMessage(error.response.data, '登录失败，请检查账号和密码后重试'))
      }
      throw new Error(
        error.code === 'ECONNABORTED' ? '登录请求超时，请重试' : '无法连接服务器，请稍后重试',
      )
    }
    throw error
  }

  if (!isRecord(payload) || payload.code !== 200) {
    throw new Error(businessMessage(payload, '登录失败，请重试'))
  }
  return parseAuthData(payload.data, '登录')
}

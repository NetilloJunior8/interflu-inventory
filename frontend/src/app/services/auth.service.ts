import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

export interface AuthUser {
  userId: number;
  username: string;
  fullName: string;
  role?: 'OPERADOR' | 'SISTEMAS' | string;
  token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly STORAGE_KEY = 'interflu_user';
  private readonly TOKEN_KEY = 'interflu_token';

  private _user = signal<AuthUser | null>(this.loadStoredUser());

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isSistemas = computed(() => this._user()?.role === 'SISTEMAS');

  constructor(private http: HttpClient) {}

  login(username: string, password: string) {
    return this.http.post<AuthUser>('/api/auth/login', { username, password }).pipe(
      tap(res => {
        localStorage.setItem(this.TOKEN_KEY, res.token);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(res));
        this._user.set(res);
      })
    );
  }

  loginWithSso(token: string) {
    return this.http.post<AuthUser>('/api/auth/sso', { token }).pipe(
      tap(res => {
        localStorage.setItem(this.TOKEN_KEY, res.token);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(res));
        this._user.set(res);
      })
    );
  }

  createUser(payload: { username: string; password: string; fullName: string }): Observable<any> {
    return this.http.post('/api/auth/users', payload);
  }

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.STORAGE_KEY);
    this._user.set(null);
  }

  private loadStoredUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      const token = localStorage.getItem(this.TOKEN_KEY);
      if (!raw || !token) return null;
      if (this.isTokenExpired(token)) {
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.TOKEN_KEY);
        return null;
      }
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload.exp) return false;
      return Date.now() >= payload.exp * 1000;
    } catch {
      return true;
    }
  }
}


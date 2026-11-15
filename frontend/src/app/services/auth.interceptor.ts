import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const token = localStorage.getItem('interflu_token');

  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // If 401 or 403 occurs on an authenticated API call (not login itself)
      if ((err.status === 401 || err.status === 403) && !req.url.includes('/api/auth/login')) {
        auth.logout();
        toast.warning('Tu sesión ha expirado o no es válida. Por favor ingresa nuevamente.');
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};


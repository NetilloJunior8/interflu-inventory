import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './services/auth.service';

const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) {
    return true;
  }
  router.navigate(['/login']);
  return false;
};

const sistemasGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn() && auth.isSistemas()) {
    return true;
  }
  router.navigate(['/dashboard']);
  return false;
};

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login.component').then(m => m.LoginComponent) },
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./pages/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'croquis', canActivate: [authGuard], loadComponent: () => import('./pages/croquis.component').then(m => m.CroquisComponent) },
  { path: 'shelves', canActivate: [authGuard], loadComponent: () => import('./pages/shelves.component').then(m => m.ShelvesComponent) },
  { path: 'capture', canActivate: [authGuard], loadComponent: () => import('./pages/capture.component').then(m => m.CaptureComponent) },
  { path: 'validation', canActivate: [authGuard], loadComponent: () => import('./pages/validation.component').then(m => m.ValidationComponent) },
  { path: 'qr-labels', canActivate: [authGuard], loadComponent: () => import('./pages/qr-labels.component').then(m => m.QrLabelsComponent) },
  { path: 'stock-alerts', canActivate: [authGuard], loadComponent: () => import('./pages/stock-alerts.component').then(m => m.StockAlertsComponent) },
  { path: 'export', canActivate: [authGuard], loadComponent: () => import('./pages/export-sae.component').then(m => m.ExportSaeComponent) },
  { path: 'audit', canActivate: [authGuard], loadComponent: () => import('./pages/audit.component').then(m => m.AuditComponent) },
  { path: 'support', canActivate: [authGuard], loadComponent: () => import('./pages/support.component').then(m => m.SupportComponent) },
  { path: 'users-admin', canActivate: [authGuard, sistemasGuard], loadComponent: () => import('./pages/users-admin.component').then(m => m.UsersAdminComponent) },
  { path: 'guide', canActivate: [authGuard], loadComponent: () => import('./pages/guide.component').then(m => m.GuideComponent) },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' }
];

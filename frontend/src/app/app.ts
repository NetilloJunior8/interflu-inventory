import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  constructor(
    public auth: AuthService,
    public toast: ToastService,
    private router: Router
  ) {}

  isLoginPage(): boolean {
    return this.router.url.includes('/login');
  }

  ngOnInit() {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.removeItem('interflu_inventory_theme');
    } catch (e) {}
  }

  logout() {
    this.auth.logout();
    this.toast.info('Sesión finalizada');
    this.router.navigate(['/login']);
  }
}

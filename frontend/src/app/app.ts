import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { ToastService } from './services/toast.service';
import { ApiService } from './services/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  pendingTicketsCount = signal<number>(0);
  private ticketPollTimer: any = null;

  constructor(
    public auth: AuthService,
    public toast: ToastService,
    private api: ApiService,
    private router: Router
  ) {}

  isLoginPage(): boolean {
    return this.router.url.includes('/login');
  }

  pollPendingTickets() {
    if (!this.auth.isLoggedIn()) {
      this.pendingTicketsCount.set(0);
      return;
    }
    this.api.getPendingTicketsCount().subscribe({
      next: (res) => this.pendingTicketsCount.set(res.pendingCount || 0),
      error: () => {}
    });
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

    this.pollPendingTickets();
    if (typeof window !== 'undefined') {
      this.ticketPollTimer = setInterval(() => {
        this.pollPendingTickets();
      }, 15000);
    }
  }

  ngOnDestroy() {
    if (this.ticketPollTimer) {
      clearInterval(this.ticketPollTimer);
      this.ticketPollTimer = null;
    }
  }

  logout() {
    this.auth.logout();
    this.pendingTicketsCount.set(0);
    this.toast.info('Sesión finalizada');
    this.router.navigate(['/login']);
  }
}

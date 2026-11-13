import { Component } from '@angular/core';
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
export class App {
  constructor(
    public auth: AuthService,
    public toast: ToastService,
    private router: Router
  ) {}

  logout() {
    this.auth.logout();
    this.toast.info('Sesión finalizada');
    this.router.navigate(['/login']);
  }
}

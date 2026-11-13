package com.interflu.inventory.dto;

public class AuthDto {

    public static class LoginRequest {
        private String username;
        private String password;

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
    }

    public static class LoginResponse {
        private String token;
        private Long userId;
        private String username;
        private String fullName;
        private String role;

        public LoginResponse(String token, Long userId, String username, String fullName) {
            this(token, userId, username, fullName, "OPERADOR");
        }

        public LoginResponse(String token, Long userId, String username, String fullName, String role) {
            this.token = token;
            this.userId = userId;
            this.username = username;
            this.fullName = fullName;
            this.role = role;
        }

        public String getToken() { return token; }
        public Long getUserId() { return userId; }
        public String getUsername() { return username; }
        public String getFullName() { return fullName; }
        public String getRole() { return role; }
    }

    public static class CreateUserRequest {
        private String username;
        private String password;
        private String fullName;

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getFullName() { return fullName; }
        public void setFullName(String fullName) { this.fullName = fullName; }
    }
}

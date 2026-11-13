# Multi-stage Dockerfile for Interflu Inventory Enterprise System
# Target OS: Linux (Ubuntu/Debian/Alpine/CentOS)

# -----------------------------------------------------------------------------
# STAGE 1: Build Angular Frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

# Install dependencies with caching
COPY frontend/package*.json ./
RUN npm install

# Build production bundle
COPY frontend/ ./
RUN npm run build

# -----------------------------------------------------------------------------
# STAGE 2: Build Spring Boot Backend
# -----------------------------------------------------------------------------
FROM maven:3.9.9-eclipse-temurin-21-alpine AS backend-builder
WORKDIR /build/backend

# Download dependencies
COPY backend/pom.xml ./
RUN mvn dependency:go-offline -B

# Copy backend source code
COPY backend/src ./src

# Inject Angular production bundle into Spring Boot static resources
COPY --from=frontend-builder /build/frontend/dist/frontend/browser/ ./src/main/resources/static/

# Package executable JAR
RUN mvn package -DskipTests -B

# -----------------------------------------------------------------------------
# STAGE 3: Production Runtime
# -----------------------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime

LABEL maintainer="Interflu Inventory Team <sistemas@interflu.com.mx>"
LABEL description="Sistema de Control de Inventario Físico para Interflu"

# Install timezone data and curl for healthchecks
RUN apk add --no-cache tzdata curl

ENV TZ=America/Mexico_City
RUN cp /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Create dedicated directory for persistent SQLite database
RUN mkdir -p /app/data && chmod 777 /app/data

# Copy JAR from backend-builder
COPY --from=backend-builder /build/backend/target/interflu-inventory-*.jar /app/interflu-inventory.jar

# Configure SQLite DB path inside persistent volume
ENV SPRING_DATASOURCE_URL=jdbc:sqlite:/app/data/interflu_inventory.db
ENV JAVA_OPTS="-Xms256m -Xmx1024m -XX:+UseG1GC -Dfile.encoding=UTF-8"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/interflu-inventory.jar"]

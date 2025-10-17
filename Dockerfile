# --- Dùng Node.js chính thức ---
FROM node:20-alpine

# --- Thư mục làm việc ---
WORKDIR /app

# --- Copy file cần thiết ---
COPY package*.json ./
RUN npm install --production

COPY . .

# --- Expose port ---
EXPOSE 3000

# --- Chạy server ---
CMD ["node", "server.js"]

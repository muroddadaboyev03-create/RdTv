const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const USERS_FILE = path.join(__dirname, 'users.json'); // Foydalanuvchilar bazasi

// Papkalarni xavfsiz tekshirish va yaratish
const videoDir = path.join(__dirname, 'uploads/videos/');
const posterDir = path.join(__dirname, 'uploads/posters/');
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
if (!fs.existsSync(posterDir)) fs.mkdirSync(posterDir, { recursive: true });

// Middleware sozlamalari
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Fayllarni saqlash tizimi (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, 'uploads/videos/');
        } else if (file.mimetype.startsWith('image/')) {
            cb(null, 'uploads/posters/');
        } else {
            cb(new Error('Noto\'g\'ri fayl turi!'), false);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Ma'lumotlar bazasini o'qish funksiyalari
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : [];
    } catch { return []; }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return data.trim() ? JSON.parse(data) : [];
    } catch { return []; }
}

function writeUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// ================= AUTH API TIZIMI =================

// 1. Ro'yxatdan o'tish (Register)
app.post('/api/auth/register', (req, res) => {
    const { name, username, password } = req.body;
    if (!name || !username || !password) {
        return res.status(400).json({ error: "Barcha maydonlarni to'ldiring!" });
    }

    const users = readUsers();
    // Login bandligini tekshirish
    const userExists = users.find(u => u.username.toLowerCase() === username.toLowerCase()) || username.toLowerCase() === 'admin';
    if (userExists) {
        return res.status(400).json({ error: "Ushbu login band! Boshqa login tanlang." });
    }

    const newUser = { id: Date.now(), name, username, password };
    users.push(newUser);
    writeUsers(users);

    res.status(201).json({ success: true, message: "Ro'yxatdan muvaffaqiyatli o'tdingiz!" });
});

// 2. Tizimga kirish (Login)
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    // Admin tekshiruvi
    if (username === 'admin' && password === 'RdTv') {
        return res.json({ success: true, role: 'admin', name: 'Admin' });
    }

    // Oddiy foydalanuvchi tekshiruvi
    const users = readUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        return res.json({ success: true, role: 'user', name: user.name });
    }

    res.status(400).json({ error: "Login yoki parol xato!" });
});


// ================= KINOLAR API TIZIMI =================

// Kinolar ro'yxatini olish
app.get('/api/movies', (req, res) => {
    res.json(readDB());
});

// Yangi kino yuklash
app.post('/api/movies', upload.fields([{ name: 'video' }, { name: 'poster' }]), (req, res) => {
    try {
        const { title, category, description } = req.body;
        const videoFile = req.files['video'] ? req.files['video'][0] : null;
        const posterFile = req.files['poster'] ? req.files['poster'][0] : null;

        if (!title || !category || !videoFile || !posterFile) {
            return res.status(400).json({ error: "Barcha maydonlar to'ldirilishi shart!" });
        }

        const movies = readDB();
        const newMovie = {
            id: Date.now(),
            title,
            category,
            description: description || "",
            videoUrl: `/uploads/videos/${videoFile.filename}`,
            poster: `/uploads/posters/${posterFile.filename}`,
            views: 0,
            likes: 0,
            comments: []
        };

        movies.push(newMovie);
        writeDB(movies);

        res.status(201).json(newMovie);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Kinoni o'chirish
app.delete('/api/movies/:id', (req, res) => {
    const id = parseInt(req.params.id);
    let movies = readDB();
    const movie = movies.find(m => m.id === id);

    if (!movie) return res.status(404).json({ error: "Kino topilmadi" });

    try {
        const videoPath = path.join(__dirname, movie.videoUrl);
        const posterPath = path.join(__dirname, movie.poster);
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (fs.existsSync(posterPath)) fs.unlinkSync(posterPath);
    } catch (err) {
        console.log("Fayl o'chirishda xato:", err.message);
    }

    movies = movies.filter(m => m.id !== id);
    writeDB(movies);
    res.json({ success: true });
});

// Ko'rishlar soni
app.post('/api/movies/:id/view', (req, res) => {
    const id = parseInt(req.params.id);
    const movies = readDB();
    const movie = movies.find(m => m.id === id);
    if (movie) {
        movie.views = (movie.views || 0) + 1;
        writeDB(movies);
        return res.json({ success: true, views: movie.views });
    }
    res.status(404).json({ error: "Kino topilmadi" });
});

// Layk bosish
app.post('/api/movies/:id/like', (req, res) => {
    const id = parseInt(req.params.id);
    const movies = readDB();
    const movie = movies.find(m => m.id === id);
    if (movie) {
        movie.likes = (movie.likes || 0) + 1;
        writeDB(movies);
        return res.json({ success: true, likes: movie.likes });
    }
    res.status(404).json({ error: "Kino topilmadi" });
});

// Izoh qoldirish
app.post('/api/movies/:id/comment', (req, res) => {
    const id = parseInt(req.params.id);
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Izoh bo'sh bo'lishi mumkin emas" });

    const movies = readDB();
    const movie = movies.find(m => m.id === id);
    if (movie) {
        const newComment = {
            id: Date.now(),
            text: text,
            date: new Date().toLocaleDateString()
        };
        movie.comments.push(newComment);
        writeDB(movies);
        return res.json(newComment);
    }
    res.status(404).json({ error: "Kino topilmadi" });
});

app.listen(PORT, () => {
    console.log(`🚀 Server muvaffaqiyatli yoqildi: http://localhost:${PORT}`);
});
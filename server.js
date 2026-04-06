const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
const imagesDir = path.join(uploadsDir, 'images');
const modelsDir = path.join(uploadsDir, 'models');
[uploadsDir, imagesDir, modelsDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use('/uploads', express.static(uploadsDir));

const dbPath = path.join(__dirname, 'db.json');
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ targets: [] }));
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'image') cb(null, 'uploads/images');
    else if (file.fieldname === 'model') cb(null, 'uploads/models');
    else if (file.fieldname === 'mind') cb(null, 'uploads');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '_' + file.originalname.replace(/\s+/g,'_'));
  }
});
const upload = multer({ storage });

// جلب كل الأهداف المسجلة
app.get('/api/targets', (req, res) => {
  const data = JSON.parse(fs.readFileSync(dbPath));
  res.json(data.targets);
});

// إضافة هدف جديد (صورة + مجسم)
app.post('/api/targets', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'model', maxCount: 1 }]), (req, res) => {
  if (!req.files['image'] || !req.files['model']) {
    return res.status(400).json({ error: 'Image and model required' });
  }

  const data = JSON.parse(fs.readFileSync(dbPath));
  const reqIndex = data.targets.length; 
  
  const newTarget = {
    id: Date.now().toString(),
    name: req.body.name || `ارتباط ${data.targets.length + 1}`,
    imageUrl: `/uploads/images/${req.files['image'][0].filename}`,
    modelUrl: `/uploads/models/${req.files['model'][0].filename}`,
    index: reqIndex
  };
  
  data.targets.push(newTarget);
  fs.writeFileSync(dbPath, JSON.stringify(data));
  res.json(newTarget);
});

// حذف هدف
app.delete('/api/targets/:id', (req, res) => {
    let data = JSON.parse(fs.readFileSync(dbPath));
    const targetIndex = data.targets.findIndex(t => t.id === req.params.id);
    if(targetIndex > -1){
        data.targets.splice(targetIndex, 1);
        data.targets.forEach((tar, idx) => tar.index = idx);
        fs.writeFileSync(dbPath, JSON.stringify(data));
        res.json({ success: true, targets: data.targets });
    } else {
        res.status(404).json({ error: 'not found' });
    }
});

// استقبال ملف .mind المدمج من لوحة التحكم (المتصفح هو من يقوم بالدمج)
app.post('/api/compile', upload.single('mind'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Mind file required' });
    const oldPath = req.file.path;
    const newPath = path.join(__dirname, 'uploads', 'targets.mind');
    if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
    fs.renameSync(oldPath, newPath);
    console.log("✅ تم استقبال وحفظ ملف targets.mind بنجاح!");
    res.json({ success: true, mindUrl: '/uploads/targets.mind' });
});

// استخدام منفذ المنصة السحابية إذا توفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend API is running on port ${PORT}..`);
});

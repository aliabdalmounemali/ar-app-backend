const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// سيتم استدعاء المكتبات ديناميكياً داخل دالة الدمج لتجنب أخطاء بدء التشغيل

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

app.get('/api/targets', (req, res) => {
  const data = JSON.parse(fs.readFileSync(dbPath));
  res.json(data.targets);
});

// الدالة السحرية للدمج التلقائي في السيرفر السحابي
async function rebuildMindFile(data) {
  let Compiler, loadImage, createCanvas;
  try {
     const mindar = await import('mind-ar/dist/mindar-image-compiler.prod.js');
     Compiler = mindar.Compiler;
     const canvasPkg = require('canvas');
     loadImage = canvasPkg.loadImage;
     createCanvas = canvasPkg.createCanvas;
  } catch(e) {
     console.log("⚠️ لم يتم العثور على مكتبات الدمج:", e.message);
     return;
  }

  try {
    const compiler = new Compiler();
    const loadedImages = [];
    
    // جلب كل الصور الموجودة بالترتيب ودمجها 
    for (let i = 0; i < data.targets.length; i++) {
        const imgPath = path.join(__dirname, data.targets[i].imageUrl.replace('/uploads/', 'uploads/'));
        const img = await loadImage(imgPath);
        
        // تحويل الصورة لبيكسلات (Canvas) لضمان توافقها 100% مع MindAR في Node
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        loadedImages.push(canvas);
    }
    
    if(loadedImages.length === 0) return;

    await compiler.compileImageTargets(loadedImages, (progress) => {
        console.log(`[السيرفر] جاري الدمج الأوتوماتيكي للصور: ${Math.round(progress)}%`);
    });
    
    // حفظ النتيجة النهائية 
    const buffer = await compiler.exportData();
    fs.writeFileSync(path.join(__dirname, 'uploads', 'targets.mind'), Buffer.from(buffer));
    console.log("✅ [السيرفر] اكتمل دمج الصور وتم حفظ ملف targets.mind بنجاح!");
  } catch (error) {
    console.error("❌ خظأ في بناء السيرفر لملف المايند:", error);
  }
}

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
    index: reqIndex // أوتوماتيكي
  };
  
  data.targets.push(newTarget);
  fs.writeFileSync(dbPath, JSON.stringify(data));
  res.json(newTarget);

  // تشغيل الدمج الأوتوماتيكي في الخلفية
  rebuildMindFile(data);
});

app.delete('/api/targets/:id', (req, res) => {
    let data = JSON.parse(fs.readFileSync(dbPath));
    const targetIndex = data.targets.findIndex(t => t.id === req.params.id);
    if(targetIndex > -1){
        data.targets.splice(targetIndex, 1);
        data.targets.forEach((tar, idx) => tar.index = idx);
        fs.writeFileSync(dbPath, JSON.stringify(data));
        res.json({ success: true, targets: data.targets });
        
        // إعادة الدمج أوتوماتيكياً بعد الحذف لعدم ترك خلل
        rebuildMindFile(data);
    } else {
        res.status(404).json({ error: 'not found' });
    }
});

app.post('/api/compile', upload.single('mind'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Mind file required' });
    const oldPath = req.file.path;
    const newPath = path.join(__dirname, 'uploads', 'targets.mind');
    if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
    fs.renameSync(oldPath, newPath);
    res.json({ success: true, mindUrl: '/uploads/targets.mind' });
});

// استخدام منفذ المنصة السحابية إذا توفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend API is running on port ${PORT}..`);
});

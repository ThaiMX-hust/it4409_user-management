require("dotenv").config({quite: true});
const express = require("express"); 
const mongoose = require("mongoose"); 
const cors = require("cors"); 
const app = express(); 

// Middleware 
app.use(cors()); 
app.use(express.json()); 

// Kết nối MongoDB với username là MSSV, password là MSSV, dbname là it4409 
mongoose 
.connect(process.env.MONGO_URI) 
.then(() => console.log("Connected to MongoDB")) 
.catch((err) => console.error("MongoDB Error:", err)); 

// Schema với email unique
const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Tên không được để trống'],
        minlength: [2, 'Tên phải có ít nhất 2 ký tự'],
        trim: true
    },
    age: {
        type: Number,
        required: [true, 'Tuổi không được để trống'],
        min: [0, 'Tuổi phải >= 0'],
        validate: {
            validator: Number.isInteger,
            message: 'Tuổi phải là số nguyên'
        }
    },
    email: {
        type: String,
        required: [true, 'Email không được để trống'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ']
    },
    address: {
        type: String,
        trim: true,
        default: ''
    }
});

const User = mongoose.model("User", UserSchema); 

// Hàm validate MongoDB ObjectId
const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};

// GET - với giới hạn page/limit và Promise.all
app.get("/api/users", async (req, res) => { 
try { 
    // Giới hạn page và limit
    let page = parseInt(req.query.page) || 1; 
    let limit = parseInt(req.query.limit) || 5; 
    const search = req.query.search?.trim() || ""; 
    
    // Validate và giới hạn page/limit
    if (page < 1) page = 1;
    if (limit < 1) limit = 5;
    if (limit > 100) limit = 100; // Giới hạn tối đa 100
    
    // Tạo query filter cho search 
    const filter = search 
    ? { 
        $or: [ 
        { name: { $regex: search, $options: "i" } }, 
        { email: { $regex: search, $options: "i" } }, 
        { address: { $regex: search, $options: "i" } } 
        ] 
    } 
    : {}; 
    
    // Tính skip 
    const skip = (page - 1) * limit; 
    
    // Sử dụng Promise.all để truy vấn song song
    const [users, total] = await Promise.all([
        User.find(filter).skip(skip).limit(limit),
        User.countDocuments(filter)
    ]);
    
    const totalPages = Math.ceil(total / limit); 
    
    // Trả về response 
    res.json({ 
        page, 
        limit, 
        total, 
        totalPages, 
        data: users 
    }); 
} catch (err) { 
    res.status(500).json({ error: err.message }); 
} 
}); 

// POST - với chuẩn hóa dữ liệu
app.post("/api/users", async (req, res) => { 
try { 
    let { name, age, email, address } = req.body; 
    
    // Chuẩn hóa dữ liệu
    name = name?.trim();
    email = email?.trim().toLowerCase();
    address = address?.trim() || '';
    age = parseInt(age);
    
    // Kiểm tra tuổi là số nguyên
    if (!Number.isInteger(age) || age < 0) {
        return res.status(400).json({ error: "Tuổi phải là số nguyên >= 0" });
    }
    
    // Kiểm tra email trùng
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).json({ error: "Email đã tồn tại" });
    }
    
    // Tạo user mới 
    const newUser = await User.create({ name, age, email, address }); 
    
    res.status(201).json({ 
        message: "Tạo người dùng thành công", 
        data: newUser 
    }); 
} catch (err) { 
    res.status(400).json({ error: err.message }); 
} 
}); 

// PUT - chỉ cập nhật trường được truyền vào
app.put("/api/users/:id", async (req, res) => { 
try { 
    const { id } = req.params; 
    
    // Validate ObjectId
    if (!isValidObjectId(id)) {
        return res.status(400).json({ error: "ID không hợp lệ" });
    }
    
    // Lấy và chuẩn hóa các trường được truyền vào
    const updateData = {};
    
    if (req.body.name !== undefined) {
        updateData.name = req.body.name.trim();
        if (updateData.name.length < 2) {
            return res.status(400).json({ error: "Tên phải có ít nhất 2 ký tự" });
        }
    }
    
    if (req.body.age !== undefined) {
        updateData.age = parseInt(req.body.age);
        if (!Number.isInteger(updateData.age) || updateData.age < 0) {
            return res.status(400).json({ error: "Tuổi phải là số nguyên >= 0" });
        }
    }
    
    if (req.body.email !== undefined) {
        updateData.email = req.body.email.trim().toLowerCase();
        // Kiểm tra email trùng 
        const existingUser = await User.findOne({ 
            email: updateData.email,
            _id: { $ne: id }
        });
        if (existingUser) {
            return res.status(400).json({ error: "Email đã tồn tại" });
        }
    }
    
    if (req.body.address !== undefined) {
        updateData.address = req.body.address.trim();
    }
    
    // Cập nhật chỉ các trường có trong updateData
    const updatedUser = await User.findByIdAndUpdate( 
        id, 
        updateData, 
        { new: true, runValidators: true }
    ); 
    
    if (!updatedUser) { 
        return res.status(404).json({ error: "Không tìm thấy người dùng" }); 
    } 
    
    res.json({ 
        message: "Cập nhật người dùng thành công", 
        data: updatedUser 
    }); 
} catch (err) { 
    res.status(400).json({ error: err.message }); 
} 
}); 

// DELETE - validate ID hợp lệ
app.delete("/api/users/:id", async (req, res) => { 
try { 
    const { id } = req.params; 
    
    // Validate ObjectId trước khi xóa
    if (!isValidObjectId(id)) {
        return res.status(400).json({ error: "ID không hợp lệ" });
    }
    
    const deletedUser = await User.findByIdAndDelete(id); 
    
    if (!deletedUser) { 
        return res.status(404).json({ error: "Không tìm thấy người dùng" }); 
    } 
    
    res.json({ message: "Xóa người dùng thành công" }); 
} catch (err) { 
    res.status(500).json({ error: err.message }); 
} 
});

// Start server 
const port = process.env.PORT || 3001; 
app.listen(port, () => { 
    console.log(`Server running on http://localhost:${port}`);
});

const supabase = require('../config/supabaseClient');

// [OPTIMASI]
const findUserByUsername = async (username) => {
    const { data, error } = await supabase
        .from('users')
        .select('id, username, password') // Hanya butuh info login
        .eq('username', username)
        .single(); 

    if (error) {
        if (error.code === 'PGRST116') return null; 
        console.error("Supabase error:", error.message);
        return null;
    }
    return data;
};

module.exports = { findUserByUsername };
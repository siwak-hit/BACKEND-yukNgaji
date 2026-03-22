const supabase = require('../config/supabaseClient');

// We use async because querying a database takes time
const findUserByUsername = async (username) => {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single(); // .single() ensures we get one object back, not an array

    if (error) {
        // If the user isn't found, Supabase throws an error. We just return null.
        if (error.code === 'PGRST116') return null; 
        
        console.error("Supabase error:", error.message);
        return null;
    }

    return data;
};

module.exports = { findUserByUsername };
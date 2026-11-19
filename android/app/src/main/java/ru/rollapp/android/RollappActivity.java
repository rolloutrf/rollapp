package ru.rollapp.android;

import android.content.Intent;
import android.os.Bundle;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

public final class RollappActivity extends LauncherActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setIntent(new Intent(this, RollappActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setFlags(getIntent().getFlags()));
        super.onCreate(savedInstanceState);
    }
}
